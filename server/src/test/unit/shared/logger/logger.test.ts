import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The logger is a module singleton configured from NODE_ENV at import time
 * (pretty transport in development, plain JSON in production), so each case
 * re-imports it against a patched environment.
 */
async function loadLogger(nodeEnv: string) {
  const snapshot = process.env.NODE_ENV;

  process.env.NODE_ENV = nodeEnv;

  vi.resetModules();

  try {
    const { logger } = await import("../../../../shared/logger/logger.js");

    return logger;
  } finally {
    process.env.NODE_ENV = snapshot;
  }
}

afterEach(() => {
  vi.resetModules();
});

describe("logger", () => {
  it.each(["development", "production"])(
    "builds a usable logger for the %s environment",
    async (nodeEnv) => {
      const logger = await loadLogger(nodeEnv);

      logger.level = "silent";

      expect(logger.level).toBe("silent");
      expect(() =>
        logger.info({ accessToken: "secret" }, "logged in"),
      ).not.toThrow();
    },
  );
});
