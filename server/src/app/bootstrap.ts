import { createRuntime } from "./runtime/createRuntime.js";
import { createContainer } from "./container/index.js";
import { createServer } from "./server.js";
import { UserChangeBroadcaster } from "../modules/users/application/UserChangeBroadcaster.js";
import { configureEventSubscriptions } from "./configureEventSubscriptions.js";
import { IntervalScheduler } from "./IntervalScheduler.js";
import { registerShutdownHooks } from "./shutdown.js";
import { FirestoreSessionRepository } from "../modules/auth/infrastructure/firestore/FirestoreSessionRepository.js";

import { env } from "../shared/config/env.js";
import { logger } from "../shared/logger/logger.js";

export async function bootstrap() {
  const runtime = await createRuntime();

  const container = createContainer(runtime);

  const server = createServer(container);

  const cleanupScheduler = new IntervalScheduler({
    intervalMs: env.eventSubGarbageCollectionIntervalMs,

    taskName: "subscription garbage collection",

    run: () =>
      container.services.subscriptionCleanup.garbageCollectSubscriptions(),
  });

  // Own repository instance rather than threading the one createSessionMiddleware
  // constructs internally (see http/configureMiddleware.ts) through server.ts -
  // the class is stateless aside from a Firestore collection reference, so a
  // second instance pointed at the same collection is safe.
  const sessionCleanupScheduler = new IntervalScheduler({
    intervalMs: env.sessionGarbageCollectionIntervalMs,

    taskName: "expired session cleanup",

    run: async () => {
      const deleted = await new FirestoreSessionRepository(
        container.firestore,
      ).purgeExpiredSessions();

      if (deleted > 0) {
        logger.info({ deleted }, "Purged expired session documents");
      }
    },
  });

  const userChangeBroadcaster = new UserChangeBroadcaster(
    container.repositories.users,
    server.sockets,
  );

  userChangeBroadcaster.start();

  // Express is already attached to server.httpServer as of createServer()
  // (see server.ts) - it has to happen before socket.io's engine.io attach()
  // runs, not after, so registering it again here would just add Express as
  // a redundant second "request" listener.
  configureEventSubscriptions(container);

  // Registered before the (potentially slow) Twitch/Discord startup calls so a
  // signal arriving during that window still triggers a graceful teardown of
  // whatever has already been started (e.g. the user change listener).
  const { shutdown } = registerShutdownHooks(
    runtime,
    container,
    server,
    userChangeBroadcaster,
    [cleanupScheduler, sessionCleanupScheduler],
  );

  const [twitchStart, discordStart] = await Promise.allSettled([
    container.twitch.start(),
    container.discord.start(),
  ]);

  for (const [name, result] of [
    ["Twitch", twitchStart],
    ["Discord", discordStart],
  ] as const) {
    if (result.status === "rejected") {
      const error = new Error(`Failed to start ${name} client`, {
        cause: result.reason,
      });

      logger.error(
        { message: error.message, stack: error.stack },
        "Application failed to start; tearing down",
      );

      // Runs the same teardown the signal handlers use - closing the tunnel
      // subprocess, disconnecting whichever of Twitch/Discord did start,
      // stopping the user-change listener - instead of leaking it all behind
      // a bare process.exit(1). shutdown() itself calls process.exit, so
      // this never returns.
      await shutdown("startup_failure");

      return;
    }
  }

  // Redis only backs the rate limiter and the EventSub replay store, both of
  // which are deliberately built to fail open on a Redis error (see
  // RedisReplayStore.rememberIfNew and RedisRateLimitStore's
  // passOnStoreError) so a transient outage degrades those features rather
  // than the whole app. Treating a connection failure here as equally fatal
  // as Twitch/Discord failing to start would be a strictly worse failure
  // mode than that: a Redis blip during a routine restart would take down
  // the HTTP API and EventSub webhook consumer along with it. ioredis keeps
  // retrying the connection in the background per its default reconnect
  // strategy, so this just logs rather than gating startup on it.
  // Undefined when REDIS_URL isn't configured at all (see
  // createRedisClient()) - nothing to connect in that case, same degraded-
  // but-functional mode as a genuine connection failure below.
  container.redis?.connect().catch((error: unknown) => {
    logger.error(
      { error },
      "Redis failed to connect at startup; rate limiting and EventSub replay dedup will run degraded until it reconnects",
    );
  });

  // Node's default behavior for an unhandled 'error' event on a stream is to
  // throw, crashing the process with a raw stack trace that bypasses both
  // structured logging and the graceful shutdown() path - leaking the
  // tunnel/Twitch/Discord clients that already started. Log and tear down
  // deliberately instead.
  server.httpServer.on("error", (error: NodeJS.ErrnoException) => {
    logger.error(
      { message: error.message, code: error.code, stack: error.stack },
      "HTTP server error; tearing down",
    );

    void shutdown("startup_failure");
  });

  server.httpServer.listen(env.port, "0.0.0.0", () => {
    logger.info({ port: env.port }, "HTTP and Socket.IO server listening");
  });

  cleanupScheduler.start();

  sessionCleanupScheduler.start();
}
