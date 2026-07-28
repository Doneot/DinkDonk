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

  await Promise.all([container.twitch.start(), container.discord.start()]);

  server.httpServer.listen(env.port, "0.0.0.0", () => {
    logger.info(`HTTP and Socket.IO server listening on ${env.port}`);
  });

  cleanupScheduler.start();

  registerShutdownHooks(
    runtime,
    container,
    server,
    userChangeBroadcaster,
    cleanupScheduler,
  );
}
