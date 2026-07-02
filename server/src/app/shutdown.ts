import type { Container } from "./container/index.js";
import type { Server } from "./server.js";
import type { SubscriptionCleanupScheduler } from "./SubscriptionCleanupScheduler.js";
import type { UserChangeBroadcaster } from "../modules/users/application/UserChangeBroadcaster.js";
import { env } from "../shared/config/env.js";
import { logger } from "../shared/logger/logger.js";

export function registerShutdownHooks(
  { twitch, discord }: Container,
  { httpServer, sockets }: Server,
  userChangeBroadCaster: UserChangeBroadcaster,
  cleanScheduler: SubscriptionCleanupScheduler,
): void {
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    logger.info(`Received ${signal}; shutting down gracefully`);

    userChangeBroadCaster.stop();

    cleanScheduler.stop();

    httpServer.close();

    try {
      await sockets.close();

      await discord.stop();

      await twitch.stop({
        unsubscribeEventSub: env.unsubscribeEventSubOnShutdown,
      });

      logger.info("Shutdown complete");

      process.exit(0);
    } catch (error) {
      const err = error as Error;

      logger.error(
        {
          message: err.message,
          stack: err.stack,
        },
        "Graceful shutdown failed",
      );

      process.exit(1);
    }
  };

  process.on("SIGINT", shutdown);

  process.on("SIGTERM", shutdown);
}
