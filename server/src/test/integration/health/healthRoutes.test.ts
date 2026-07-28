import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHealthRouter } from "../../../http/routes/healthRoutes.js";
import { createMetricsRouter } from "../../../http/routes/metricsRoutes.js";
import { logger } from "../../../shared/logger/logger.js";

import { InMemoryAuthUserRepository } from "../../repositories/inMemory/InMemoryAuthUserRepository.js";

function createHealthApp() {
  const authUserRepository = new InMemoryAuthUserRepository();
  const app = express();

  app.use("/health", createHealthRouter({ authUserRepository }));

  return { app, authUserRepository };
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
    const { app, authUserRepository } = createHealthApp();

    vi.spyOn(authUserRepository, "checkConnection").mockRejectedValue(
      new Error("firestore unavailable"),
    );

    await request(app).get("/health/ready").expect(503);

    expect(error).toHaveBeenCalledOnce();
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
