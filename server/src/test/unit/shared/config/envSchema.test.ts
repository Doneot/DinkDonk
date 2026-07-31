import { describe, expect, it } from "vitest";

import { EnvSchema } from "../../../../shared/config/envSchema.js";

const REQUIRED_FIREBASE_KEYS = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
] as const;

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    SERVER_URL: "http://localhost:3000",
    REDIS_URL: "redis://localhost:6379",
    SESSION_SECRET: "session-secret-16-bytes-long!!!!",
    ENCRYPTION_KEY: "encryption-key-32-bytes-long!!!!",
    DISCORD_CLIENT_ID: "discord-client-id",
    DISCORD_CLIENT_SECRET: "discord-client-secret",
    DISCORD_TOKEN: "discord-token",
    TWITCH_CLIENT_ID: "twitch-client-id",
    TWITCH_CLIENT_SECRET: "twitch-client-secret",
    TWITCH_WEBHOOK_SECRET: "twitch-webhook-secret",
    WEB_PUSH_PUBLIC_KEY: "web-push-public-key",
    WEB_PUSH_PRIVATE_KEY: "web-push-private-key",
    WEB_PUSH_SUBJECT: "mailto:test@example.com",
    FIREBASE_PROJECT_ID: "project",
    FIREBASE_CLIENT_EMAIL: "firebase@example.com",
    FIREBASE_PRIVATE_KEY: "private-key",
    ...overrides,
  };
}

function messagesFor(env: Record<string, string | undefined>): string[] {
  const result = EnvSchema.safeParse(env);

  expect(result.success).toBe(false);

  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

describe("EnvSchema", () => {
  it("applies defaults for optional runtime settings", () => {
    const parsed = EnvSchema.parse(baseEnv());

    expect(parsed).toMatchObject({
      NODE_ENV: "development",
      UNSUBSCRIBE_EVENTSUB_ON_SHUTDOWN: false,
      EVENTSUB_GC_INTERVAL_MS: 6 * 60 * 60 * 1000,
      PROMETHEUS_ENABLED: false,
      REQUEST_LOGGING_ENABLED: false,
      LOG_LEVEL: "info",
    });
  });

  // Unlike most numeric env vars, PORT has no schema-level default: it must
  // be able to come back genuinely undefined so env.ts can fall back to
  // BACKEND_PORT before finally defaulting to 3000 itself.
  it("leaves PORT undefined when unset", () => {
    const parsed = EnvSchema.parse(baseEnv());

    expect(parsed.PORT).toBeUndefined();
  });

  it("rejects a non-numeric PORT", () => {
    expect(messagesFor(baseEnv({ PORT: "not-a-number" }))).not.toHaveLength(
      0,
    );
  });

  it("rejects a PORT of zero", () => {
    expect(messagesFor(baseEnv({ PORT: "0" }))).not.toHaveLength(0);
  });

  it("coerces a numeric PORT", () => {
    const parsed = EnvSchema.parse(baseEnv({ PORT: "8080" }));

    expect(parsed.PORT).toBe(8080);
  });

  it("reads explicit runtime settings", () => {
    const parsed = EnvSchema.parse(
      baseEnv({
        NODE_ENV: "production",
        PORT: "8080",
        UNSUBSCRIBE_EVENTSUB_ON_SHUTDOWN: "true",
        EVENTSUB_GC_INTERVAL_MS: "1000",
        PROMETHEUS_ENABLED: "1",
        METRICS_TOKEN: "a-real-metrics-token-1234567890",
        REQUEST_LOGGING_ENABLED: "1",
        TUNNEL_PROVIDER: "ssh",
      }),
    );

    expect(parsed).toMatchObject({
      NODE_ENV: "production",
      PORT: 8080,
      UNSUBSCRIBE_EVENTSUB_ON_SHUTDOWN: true,
      EVENTSUB_GC_INTERVAL_MS: 1000,
      PROMETHEUS_ENABLED: true,
      REQUEST_LOGGING_ENABLED: true,
      TUNNEL_PROVIDER: "ssh",
    });
  });

  it.each(REQUIRED_FIREBASE_KEYS)(
    "requires %s when no service account file is configured",
    (key) => {
      expect(messagesFor(baseEnv({ [key]: undefined }))).toContain(
        `${key} is required`,
      );
    },
  );

  it("reports every missing Firebase credential at once", () => {
    const env = baseEnv();

    for (const key of REQUIRED_FIREBASE_KEYS) {
      delete (env as Record<string, unknown>)[key];
    }

    expect(messagesFor(env)).toEqual(
      REQUIRED_FIREBASE_KEYS.map((key) => `${key} is required`),
    );
  });

  it("skips inline Firebase credentials when a service account file is used", () => {
    const env = baseEnv();

    for (const key of REQUIRED_FIREBASE_KEYS) {
      delete (env as Record<string, unknown>)[key];
    }

    const parsed = EnvSchema.parse({
      ...env,
      GOOGLE_APPLICATION_CREDENTIALS: "/run/secrets/firebase_service_account",
    });

    expect(parsed.GOOGLE_APPLICATION_CREDENTIALS).toBe(
      "/run/secrets/firebase_service_account",
    );
  });

  it("rejects an invalid SERVER_URL", () => {
    expect(messagesFor(baseEnv({ SERVER_URL: "not-a-url" }))).not.toHaveLength(
      0,
    );
  });

  it.each([
    "SESSION_SECRET",
    "ENCRYPTION_KEY",
    "DISCORD_TOKEN",
    "TWITCH_CLIENT_ID",
    "TWITCH_WEBHOOK_SECRET",
    "WEB_PUSH_PUBLIC_KEY",
  ])("rejects a missing %s", (key) => {
    expect(messagesFor(baseEnv({ [key]: undefined }))).not.toHaveLength(0);
  });

  it("rejects a SESSION_SECRET that is too short", () => {
    expect(
      messagesFor(baseEnv({ SESSION_SECRET: "too-short" })),
    ).not.toHaveLength(0);
  });

  it("keeps a single SESSION_SECRET as a one-element list", () => {
    const parsed = EnvSchema.parse(baseEnv());

    expect(parsed.SESSION_SECRET).toEqual([
      "session-secret-16-bytes-long!!!!",
    ]);
  });

  it("splits a comma-separated SESSION_SECRET for rotation", () => {
    const parsed = EnvSchema.parse(
      baseEnv({
        SESSION_SECRET:
          "new-secret-16-bytes-long!!, old-secret-16-bytes-long!!",
      }),
    );

    expect(parsed.SESSION_SECRET).toEqual([
      "new-secret-16-bytes-long!!",
      "old-secret-16-bytes-long!!",
    ]);
  });

  it("rejects a comma-separated SESSION_SECRET with a too-short entry", () => {
    expect(
      messagesFor(
        baseEnv({
          SESSION_SECRET: "session-secret-16-bytes-long!!!!,short",
        }),
      ),
    ).not.toHaveLength(0);
  });

  it("leaves GOOGLE_CLIENT_ID/SECRET undefined when both unset", () => {
    const parsed = EnvSchema.parse(baseEnv());

    expect(parsed.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(parsed.GOOGLE_CLIENT_SECRET).toBeUndefined();
  });

  it("accepts GOOGLE_CLIENT_ID/SECRET when both are set", () => {
    const parsed = EnvSchema.parse(
      baseEnv({
        GOOGLE_CLIENT_ID: "google-client-id",
        GOOGLE_CLIENT_SECRET: "google-client-secret",
      }),
    );

    expect(parsed.GOOGLE_CLIENT_ID).toBe("google-client-id");
    expect(parsed.GOOGLE_CLIENT_SECRET).toBe("google-client-secret");
  });

  it.each(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"])(
    "rejects %s set without its counterpart",
    (key) => {
      expect(
        messagesFor(baseEnv({ [key]: "only-one-set" })),
      ).toContain(
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set, or both left unset",
      );
    },
  );

  it("defaults TWITCH_LOGIN_ENABLED to false when unset", () => {
    const parsed = EnvSchema.parse(baseEnv());

    expect(parsed.TWITCH_LOGIN_ENABLED).toBe(false);
  });

  it("reads an explicit TWITCH_LOGIN_ENABLED", () => {
    const parsed = EnvSchema.parse(
      baseEnv({ TWITCH_LOGIN_ENABLED: "true" }),
    );

    expect(parsed.TWITCH_LOGIN_ENABLED).toBe(true);
  });

  it("leaves METRICS_TOKEN undefined when unset", () => {
    const parsed = EnvSchema.parse(baseEnv());

    expect(parsed.METRICS_TOKEN).toBeUndefined();
  });

  it("accepts a METRICS_TOKEN of sufficient length", () => {
    const parsed = EnvSchema.parse(
      baseEnv({ METRICS_TOKEN: "a-real-metrics-token-1234567890" }),
    );

    expect(parsed.METRICS_TOKEN).toBe("a-real-metrics-token-1234567890");
  });

  it("rejects a METRICS_TOKEN that is too short", () => {
    expect(
      messagesFor(baseEnv({ METRICS_TOKEN: "too-short" })),
    ).not.toHaveLength(0);
  });

  it("requires METRICS_TOKEN when PROMETHEUS_ENABLED is true", () => {
    expect(
      messagesFor(baseEnv({ PROMETHEUS_ENABLED: "true" })),
    ).toContain("METRICS_TOKEN is required when PROMETHEUS_ENABLED is true");
  });

  it("accepts PROMETHEUS_ENABLED with a METRICS_TOKEN set", () => {
    const parsed = EnvSchema.parse(
      baseEnv({
        PROMETHEUS_ENABLED: "true",
        METRICS_TOKEN: "a-real-metrics-token-1234567890",
      }),
    );

    expect(parsed.PROMETHEUS_ENABLED).toBe(true);
    expect(parsed.METRICS_TOKEN).toBe("a-real-metrics-token-1234567890");
  });

  it("rejects a non-numeric BACKEND_PORT", () => {
    expect(
      messagesFor(baseEnv({ BACKEND_PORT: "not-a-number" })),
    ).not.toHaveLength(0);
  });

  it("coerces a numeric BACKEND_PORT", () => {
    const parsed = EnvSchema.parse(baseEnv({ BACKEND_PORT: "4100" }));

    expect(parsed.BACKEND_PORT).toBe(4100);
  });

  it("rejects an unknown tunnel provider", () => {
    expect(
      messagesFor(baseEnv({ TUNNEL_PROVIDER: "cloudflare" })),
    ).not.toHaveLength(0);
  });

  it("defaults LOG_LEVEL to info", () => {
    const parsed = EnvSchema.parse(baseEnv());

    expect(parsed.LOG_LEVEL).toBe("info");
  });

  it("reads an explicit LOG_LEVEL", () => {
    const parsed = EnvSchema.parse(baseEnv({ LOG_LEVEL: "debug" }));

    expect(parsed.LOG_LEVEL).toBe("debug");
  });

  it("rejects an unknown LOG_LEVEL", () => {
    expect(
      messagesFor(baseEnv({ LOG_LEVEL: "verbose" })),
    ).not.toHaveLength(0);
  });
});
