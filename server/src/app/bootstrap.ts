import { createRuntime } from "./runtime/createRuntime.js";
import { createContainer } from "./container/index.js";
import { createServer } from "./server.js";
import { UserChangeBroadcaster } from "../modules/users/application/UserChangeBroadcaster.js";
import { configureEventSubscriptions } from "./configureEventSubscriptions.js";
import { SubscriptionCleanupScheduler } from "./SubscriptionCleanupScheduler.js";
import { registerShutdownHooks } from "./shutdown.js";

import { env } from "../shared/config/env.js";
import { logger } from "../shared/logger/logger.js";

export async function bootstrap() {
  const runtime = await createRuntime();

  const container = createContainer(runtime);

  const server = createServer(container);

  const cleanupScheduler = new SubscriptionCleanupScheduler({
    intervalMs: env.eventSubGarbageCollectionIntervalMs,

    garbageCollectSubscriptions: () =>
      container.services.subscriptionCleanup.garbageCollectSubscriptions(),
  });

  const userChangeBroadcaster = new UserChangeBroadcaster(
    container.firestore,
    server.sockets,
  );

  userChangeBroadcaster.start();

  server.httpServer.on("request", server.app);

  configureEventSubscriptions(container);

  // Registered before the (potentially slow) Twitch/Discord startup calls so a
  // signal arriving during that window still triggers a graceful teardown of
  // whatever has already been started (e.g. the user change listener).
  const { shutdown } = registerShutdownHooks(
    runtime,
    container,
    server,
    userChangeBroadcaster,
    cleanupScheduler,
  );

  const [twitchStart, discordStart, redisStart] = await Promise.allSettled([
    container.twitch.start(),
    container.discord.start(),
    container.redis.connect(),
  ]);

  for (const [name, result] of [
    ["Twitch", twitchStart],
    ["Discord", discordStart],
    ["Redis", redisStart],
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
    logger.info(`HTTP and Socket.IO server listening on ${env.port}`);
  });

  cleanupScheduler.start();
}
