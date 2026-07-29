import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHealthRouter } from "../../../http/routes/healthRoutes.js";
import { createMetricsRouter } from "../../../http/routes/metricsRoutes.js";
import { logger } from "../../../shared/logger/logger.js";

import { InMemoryIdentityRepository } from "../../repositories/inMemory/InMemoryIdentityRepository.js";

function createHealthApp(
  overrides: { discordReady?: boolean; twitchReady?: boolean } = {},
) {
  const identityRepository = new InMemoryIdentityRepository();
  const app = express();

  app.use(
    "/health",
    createHealthRouter({
      identityRepository,
      ...(overrides.discordReady !== undefined
        ? { discord: { isReady: overrides.discordReady } }
        : {}),
      ...(overrides.twitchReady !== undefined
        ? { twitch: { isReady: overrides.twitchReady } }
        : {}),
    }),
  );

  return { app, identityRepository };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /health/live", () => {
  it("always reports the process as alive", async () => {
    const { app } = createHealthApp();

    await request(app).get("/health/live").expect(200);
  });
});

describe("GET /health/ready", () => {
  it("reports ready when the datastore is reachable", async () => {
    const { app } = createHealthApp();

    await request(app).get("/health/ready").expect(200);
  });

  it("reports unavailable when the datastore connection check fails", async () => {
    const error = vi.spyOn(logger, "error").mockReturnValue();
    const { app, identityRepository } = createHealthApp();

    vi.spyOn(identityRepository, "checkConnection").mockRejectedValue(
      new Error("firestore unavailable"),
    );

    await request(app).get("/health/ready").expect(503);

    expect(error).toHaveBeenCalledOnce();
  });

  it("reports unavailable when the Discord bot is not ready", async () => {
    const warn = vi.spyOn(logger, "warn").mockReturnValue();
    const { app } = createHealthApp({ discordReady: false });

    await request(app).get("/health/ready").expect(503);

    expect(warn).toHaveBeenCalledWith(
      { notReady: ["discord"] },
      "Readiness check failed",
    );
  });

  it("reports unavailable when the Twitch client is not ready", async () => {
    vi.spyOn(logger, "warn").mockReturnValue();
    const { app } = createHealthApp({ twitchReady: false });

    await request(app).get("/health/ready").expect(503);
  });

  it("reports ready when Discord and Twitch both report ready", async () => {
    const { app } = createHealthApp({ discordReady: true, twitchReady: true });

    await request(app).get("/health/ready").expect(200);
  });
});

describe("GET /metrics", () => {
  it("exposes the Prometheus registry in its text exposition format", async () => {
    const app = express();

    app.use("/metrics", createMetricsRouter());

    const response = await request(app).get("/metrics").expect(200);

    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.text).toContain("eventsub_requests_total");
    expect(response.text).toContain("eventsub_subscriptions_created_total");
  });
});
