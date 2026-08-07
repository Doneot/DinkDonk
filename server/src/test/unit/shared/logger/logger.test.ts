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

  describe("redaction", () => {
    /**
     * pino's default destination writes straight to the stdout file
     * descriptor (via sonic-boom), which bypasses process.stdout.write and
     * can't be intercepted with a spy. Building a throwaway logger against
     * an explicit stream destination lets these tests observe real pino
     * output instead of asserting on the redact config's shape.
     */
    async function loggerWithCapturedOutput() {
      const { default: pino } = await import("pino");
      const { redact } = await import("../../../../shared/logger/logger.js");

      const chunks: string[] = [];
      // A minimal DestinationStream (just `.write`) rather than a real
      // Node stream, so pino writes synchronously without any
      // sonic-boom/fd buffering to race against in the assertions below.
      const destination = {
        write: (chunk: string) => {
          chunks.push(chunk);
        },
      };

      return {
        logger: pino({ redact }, destination),
        lastLine: () =>
          JSON.parse(chunks.at(-1) ?? "{}") as Record<string, unknown>,
      };
    }

    it("redacts a sensitive field at the top level and one level nested", async () => {
      const { logger, lastLine } = await loggerWithCapturedOutput();

      logger.info(
        {
          accessToken: "top-level-secret",
          user: { refreshToken: "nested-secret" },
        },
        "logged in",
      );

      const parsed = lastLine();

      expect(parsed.accessToken).toBe("[REDACTED]");
      expect((parsed.user as { refreshToken: string }).refreshToken).toBe(
        "[REDACTED]",
      );
    });

    it("redacts a sensitive field nested two levels deep", async () => {
      const { logger, lastLine } = await loggerWithCapturedOutput();

      logger.info(
        { tokens: { discord: { accessToken: "deeply-nested-secret" } } },
        "token stored",
      );

      const parsed = lastLine() as {
        tokens: { discord: { accessToken: string } };
      };

      expect(parsed.tokens.discord.accessToken).toBe("[REDACTED]");
    });

    /**
     * SENSITIVE_FIELDS only generates wildcard paths two levels deep (see
     * its comment in logger.ts), so a field nested a third level down is
     * currently logged in the clear. This test doesn't guard a bug - it
     * pins that documented limitation down as an executable fact: if a real
     * log call is ever shaped like this, it silently leaks a secret, and
     * whoever extends SENSITIVE_FIELDS' wildcard depth to fix that will
     * find this assertion and know to update it alongside the fix.
     */
    it("does not redact a sensitive field nested three levels deep (documents the current limit)", async () => {
      const { logger, lastLine } = await loggerWithCapturedOutput();

      logger.info(
        {
          session: { user: { tokens: { accessToken: "unredacted-secret" } } },
        },
        "session loaded",
      );

      const parsed = lastLine() as {
        session: { user: { tokens: { accessToken: string } } };
      };

      expect(parsed.session.user.tokens.accessToken).toBe(
        "unredacted-secret",
      );
    });
  });
});
