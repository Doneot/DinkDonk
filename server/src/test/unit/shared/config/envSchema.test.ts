import { describe, expect, it } from "vitest";

import { EnvSchema } from "../../../../shared/config/envSchema.js";

const REQUIRED_FIREBASE_KEYS = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY_ID",
  "FIREBASE_PRIVATE_KEY",
] as const;

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    SERVER_URL: "http://localhost:3000",
    SESSION_SECRET: "session-secret",
    DISCORD_CLIENT_ID: "discord-client-id",
    DISCORD_CLIENT_SECRET: "discord-client-secret",
    DISCORD_TOKEN: "discord-token",
    TWITCH_CLIENT_ID: "twitch-client-id",
    TWITCH_CLIENT_SECRET: "twitch-client-secret",
    TWITCH_WEBHOOK_SECRET: "twitch-webhook-secret",
    ADMIN_PASSWORD: "admin-password",
    WEB_PUSH_PUBLIC_KEY: "web-push-public-key",
    WEB_PUSH_PRIVATE_KEY: "web-push-private-key",
    WEB_PUSH_SUBJECT: "mailto:test@example.com",
    FIREBASE_PROJECT_ID: "project",
    FIREBASE_CLIENT_ID: "client",
    FIREBASE_CLIENT_EMAIL: "firebase@example.com",
    FIREBASE_PRIVATE_KEY_ID: "key-id",
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
      PORT: 3000,
      UNSUBSCRIBE_EVENTSUB_ON_SHUTDOWN: false,
      EVENTSUB_GC_INTERVAL_MS: 6 * 60 * 60 * 1000,
      PROMETHEUS_ENABLED: false,
      REQUEST_LOGGING_ENABLED: false,
    });
  });

  it("reads explicit runtime settings", () => {
    const parsed = EnvSchema.parse(
      baseEnv({
        NODE_ENV: "production",
        PORT: "8080",
        UNSUBSCRIBE_EVENTSUB_ON_SHUTDOWN: "true",
        EVENTSUB_GC_INTERVAL_MS: "1000",
        PROMETHEUS_ENABLED: "1",
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
      GOOGLE_APPLICATION_CREDENTIALS:
        "https://example.com/service-account.json",
    });

    expect(parsed.GOOGLE_APPLICATION_CREDENTIALS).toBe(
      "https://example.com/service-account.json",
    );
  });

  it("rejects an invalid SERVER_URL", () => {
    expect(messagesFor(baseEnv({ SERVER_URL: "not-a-url" }))).not.toHaveLength(
      0,
    );
  });

  it.each([
    "SESSION_SECRET",
    "DISCORD_TOKEN",
    "TWITCH_CLIENT_ID",
    "TWITCH_WEBHOOK_SECRET",
    "ADMIN_PASSWORD",
    "WEB_PUSH_PUBLIC_KEY",
  ])("rejects a missing %s", (key) => {
    expect(messagesFor(baseEnv({ [key]: undefined }))).not.toHaveLength(0);
  });

  it("rejects an unknown tunnel provider", () => {
    expect(
      messagesFor(baseEnv({ TUNNEL_PROVIDER: "cloudflare" })),
    ).not.toHaveLength(0);
  });
});
