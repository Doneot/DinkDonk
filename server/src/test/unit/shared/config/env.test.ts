import { afterEach, describe, expect, it, vi } from "vitest";

import type * as EnvModule from "../../../../shared/config/env.js";

type Env = (typeof EnvModule)["env"];

const BASE_OVERRIDES: Record<string, string | undefined> = {
  PORT: undefined,
  BACKEND_PORT: undefined,
  CLIENT_ORIGIN: undefined,
  GOOGLE_APPLICATION_CREDENTIALS: undefined,
};

/**
 * `env` is a module singleton built from process.env at import time, so each
 * case re-imports it against a patched environment.
 */
async function loadEnv(
  overrides: Record<string, string | undefined> = {},
): Promise<Env> {
  const snapshot = { ...process.env };

  for (const [key, value] of Object.entries({
    ...BASE_OVERRIDES,
    ...overrides,
  })) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  vi.resetModules();

  try {
    const { env } = await import("../../../../shared/config/env.js");

    return env;
  } finally {
    process.env = snapshot;
  }
}

afterEach(() => {
  vi.resetModules();
});

describe("env", () => {
  it("marks non-production environments", async () => {
    const env = await loadEnv({ NODE_ENV: "test" });

    expect(env.nodeEnv).toBe("test");
    expect(env.isProduction).toBe(false);
  });

  it("marks the production environment", async () => {
    const env = await loadEnv({ NODE_ENV: "production" });

    expect(env.isProduction).toBe(true);
  });

  it("defaults the port to 3000", async () => {
    const env = await loadEnv();

    expect(env.port).toBe(3000);
  });

  it("prefers an explicit PORT", async () => {
    const env = await loadEnv({ PORT: "8080" });

    expect(env.port).toBe(8080);
  });

  it("falls back to BACKEND_PORT when PORT is zero", async () => {
    const env = await loadEnv({ PORT: "0", BACKEND_PORT: "4100" });

    expect(env.port).toBe(4100);
  });

  it("falls back to 3000 when neither port is usable", async () => {
    const env = await loadEnv({ PORT: "0" });

    expect(env.port).toBe(3000);
  });

  it("defaults the client origin to the server url", async () => {
    const env = await loadEnv();

    expect(env.clientOrigin).toBe(env.serverUrl);
  });

  it("prefers an explicit client origin", async () => {
    const env = await loadEnv({ CLIENT_ORIGIN: "https://app.example.com" });

    expect(env.clientOrigin).toBe("https://app.example.com");
  });

  it("unescapes newlines in the Firebase private key", async () => {
    const env = await loadEnv({
      FIREBASE_PRIVATE_KEY: "-----BEGIN-----\\nkey\\n-----END-----",
    });

    expect(env.firebase.privateKey).toBe("-----BEGIN-----\nkey\n-----END-----");
  });

  it("exposes the service account path when one is configured", async () => {
    const env = await loadEnv({
      GOOGLE_APPLICATION_CREDENTIALS:
        "https://example.com/service-account.json",
    });

    expect(env.firebase.serviceAccountPath).toBe(
      "https://example.com/service-account.json",
    );
    expect(env.firebase.clientX509CertUrl).toBe(
      "https://example.com/service-account.json",
    );
  });

  it("groups the third-party credentials it was given", async () => {
    const env = await loadEnv();

    expect(env.twitch).toEqual({
      clientId: "twitch-client-id",
      clientSecret: "twitch-client-secret",
      webhookSecret: "twitch-webhook-secret",
    });
    expect(env.webPush).toEqual({
      publicKey: "web-push-public-key",
      privateKey: "web-push-private-key",
      subject: "mailto:test@example.com",
    });
    expect(env.tunneling.ngrok.authToken).toBe("ngrok-auth-token");
    expect(env.tunneling.ssh.tunnelUrl).toBe("http://localhost:4000");
  });
});
