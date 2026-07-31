import { logger } from "../shared/logger/logger.js";

import { bootstrap } from "./bootstrap.js";

function logFatal(source: string, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));

  logger.fatal(
    {
      source,
      message: err.message,
      stack: err.stack,
    },
    "Unhandled error; exiting",
  );
}

// Without these, a stray rejection or throw anywhere outside the explicitly
// awaited bootstrap() chain crashes the process via Node's default behavior
// - skipping the pino flush and the shutdown() teardown path entirely.
process.on("unhandledRejection", (error: unknown) => {
  logFatal("unhandledRejection", error);

  process.exit(1);
});

process.on("uncaughtException", (error: unknown) => {
  logFatal("uncaughtException", error);

  process.exit(1);
});

await bootstrap().catch((error: unknown) => {
  const err = error instanceof Error ? error : new Error(String(error));

  logger.error(
    {
      message: err.message,
      stack: err.stack,
    },
    "Application failed to start",
  );

  process.exit(1);
});
