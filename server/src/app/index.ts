import { logger } from "../shared/logger/logger.js";

import { bootstrap } from "./bootstrap.js";

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
