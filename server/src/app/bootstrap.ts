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
  registerShutdownHooks(
    runtime,
    container,
    server,
    userChangeBroadcaster,
    cleanupScheduler,
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
      throw new Error(`Failed to start ${name} client`, {
        cause: result.reason,
      });
    }
  }

  server.httpServer.listen(env.port, "0.0.0.0", () => {
    logger.info(`HTTP and Socket.IO server listening on ${env.port}`);
  });

  cleanupScheduler.start();
}
