import type { Container } from "./container/index.js";
import type { Server } from "./server.js";
import type { SubscriptionCleanupScheduler } from "./SubscriptionCleanupScheduler.js";
import type { UserChangeBroadcaster } from "../modules/users/application/UserChangeBroadcaster.js";
import { env } from "../shared/config/env.js";
import { logger } from "../shared/logger/logger.js";
import type { Runtime } from "./runtime/Runtime.js";

const SHUTDOWN_STEP_TIMEOUT_MS = 5000;

type StepOutcome =
  | { kind: "resolved" }
  | { kind: "rejected"; error: unknown }
  | { kind: "timedOut" };

/**
 * Runs a single shutdown step with a timeout, so one hung dependency can't
 * stall the rest of teardown. Never rejects: a timeout is logged and treated
 * as recoverable (the caller's `onTimeout` gets a chance to force things
 * along, e.g. closing remaining sockets), while an actual rejection is
 * logged and reported back via `failed` so the process can still exit with a
 * non-zero code once every step has been attempted.
 */
async function runStep(
  step: Promise<unknown>,
  description: string,
  onTimeout?: () => void,
): Promise<{ failed: boolean }> {
  const outcome = await Promise.race([
    step.then(
      (): StepOutcome => ({ kind: "resolved" }),
      (error: unknown): StepOutcome => ({ kind: "rejected", error }),
    ),
    new Promise<StepOutcome>((resolve) => {
      setTimeout(() => {
        onTimeout?.();
        resolve({ kind: "timedOut" });
      }, SHUTDOWN_STEP_TIMEOUT_MS).unref();
    }),
  ]);

  switch (outcome.kind) {
    case "timedOut":
      logger.warn(
        { step: description },
        "Shutdown step timed out; continuing teardown",
      );
      return { failed: false };

    case "rejected":
      logger.warn(
        { step: description, error: outcome.error },
        "Shutdown step failed; continuing teardown",
      );
      return { failed: true };

    case "resolved":
      return { failed: false };
  }
}

export type ShutdownReason = NodeJS.Signals | "startup_failure";

export type ShutdownHandle = {
  /**
   * Runs the same teardown sequence the signal handlers use. Exposed so a
   * bootstrap failure (e.g. Twitch/Discord rejecting on startup) can tear
   * down whatever already started - the runtime's tunnel subprocess, an
   * already-logged-in Discord client, the user-change listener - instead of
   * leaking it behind a bare `process.exit(1)`.
   */
  shutdown: (reason: ShutdownReason) => Promise<void>;
};

export function registerShutdownHooks(
  runtime: Runtime,
  { twitch, discord, firestore, redis }: Container,
  { httpServer, sockets }: Server,
  userChangeBroadCaster: UserChangeBroadcaster,
  cleanScheduler: SubscriptionCleanupScheduler,
): ShutdownHandle {
  let shuttingDown = false;

  const shutdown = async (reason: ShutdownReason): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    logger.info({ reason }, "Shutting down gracefully");

    let hadFailure = false;

    const track = async (
      step: Promise<unknown>,
      description: string,
      onTimeout?: () => void,
    ): Promise<void> => {
      const { failed } = await runStep(step, description, onTimeout);

      if (failed) {
        hadFailure = true;
      }
    };

    try {
      // Wrapped in the same try/catch as every other step below (rather than
      // called bare beforehand) so a synchronous throw from either .stop()
      // can't bypass the rest of teardown and the process.exit() call.
      userChangeBroadCaster.stop();

      cleanScheduler.stop();

      await track(runtime.dispose(), "runtime.dispose");

      // sockets/discord/twitch are independent external connections with no
      // ordering dependency on one another - running them concurrently keeps
      // the worst-case teardown time to roughly one step's timeout instead of
      // three, which matters because Docker's default stop_grace_period
      // (10s) is shorter than three sequential 5s step timeouts.
      await Promise.all([
        // sockets.close() (io.close()) disconnects every live WebSocket
        // client and, because the Socket.IO server was attached to this
        // http.Server, also closes that http.Server once its clients are
        // gone - there is no separate http.Server.close() call to make here,
        // since http.Server rejects a second close() on an already-closed
        // server. Bound the whole thing with a timeout and force-close
        // anything still open as a last resort, since http.Server.close()'s
        // callback only fires once every open connection has ended.
        track(sockets.close(), "sockets.close", () => {
          httpServer.closeAllConnections();
        }),

        track(discord.stop(), "discord.stop"),

        track(
          twitch.stop({
            unsubscribeEventSub: env.unsubscribeEventSubOnShutdown,
          }),
          "twitch.stop",
        ),
      ]);

      await Promise.all([
        track(firestore.terminate(), "firestore.terminate"),

        // quit() sends a graceful QUIT and waits for pending replies, unlike
        // disconnect() which drops the connection immediately.
        track(redis.quit(), "redis.quit"),
      ]);

      logger.info("Shutdown complete");

      await new Promise<void>((resolve) => {
        logger.flush(() => resolve());
      });

      process.exit(hadFailure ? 1 : 0);
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

  return { shutdown };
}
