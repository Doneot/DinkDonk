import type { Container } from "./container/index.js";
import type { Server } from "./server.js";
import type { SubscriptionCleanupScheduler } from "./SubscriptionCleanupScheduler.js";
import type { UserChangeBroadcaster } from "../modules/users/application/UserChangeBroadcaster.js";
import { env } from "../shared/config/env.js";
import { logger } from "../shared/logger/logger.js";
import type { Runtime } from "./runtime/Runtime.js";
import { closeHttpServer } from "../shared/utils/http.js";

const HTTP_CLOSE_TIMEOUT_MS = 5000;

export function registerShutdownHooks(
  runtime: Runtime,
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

    try {
      await runtime.dispose();

      // Disconnect live WebSocket clients first (io.close() also closes the
      // underlying http.Server once its clients are gone). http.Server.close()
      // only invokes its callback once every open connection has ended, so
      // closing it before the sockets riding on it would hang indefinitely on
      // a single lingering client; bound the whole thing with a timeout and
      // force-close anything still open as a last resort.
      await sockets.close();

      await Promise.race([
        closeHttpServer(httpServer),
        new Promise<void>((_, reject) => {
          setTimeout(
            () => reject(new Error("Timed out waiting for HTTP server to close")),
            HTTP_CLOSE_TIMEOUT_MS,
          ).unref();
        }),
      ]).catch((error: unknown) => {
        logger.warn(
          { message: (error as Error).message },
          "Forcing remaining HTTP connections closed after timeout",
        );

        httpServer.closeAllConnections();
      });

      await discord.stop();

      await twitch.stop({
        unsubscribeEventSub: env.unsubscribeEventSubOnShutdown,
      });

      logger.info("Shutdown complete");

      await new Promise<void>((resolve) => {
        logger.flush(() => resolve());
      });

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

  if (process.platform === "win32") {
    process.on("SIGBREAK", shutdown);
  }

  process.on("SIGINT", shutdown);

  process.on("SIGTERM", shutdown);
}
