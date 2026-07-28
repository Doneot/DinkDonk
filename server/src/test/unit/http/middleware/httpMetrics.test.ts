import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { httpMetrics } from "../../../../http/middleware/httpMetrics.js";
import { register } from "../../../../infrastructure/metrics/prometheus.js";

function createApp() {
  const app = express();

  app.use(httpMetrics);

  app.get("/ok/:id", (_req, res) => {
    res.json({ ok: true });
  });

  const nested = express.Router();

  nested.get("/nested", (_req, res) => {
    res.sendStatus(204);
  });

  app.use("/api", nested);

  return app;
}

afterEach(() => {
  register.getSingleMetric("http_request_duration_seconds")?.reset();
});

describe("httpMetrics", () => {
  it("labels the metric with the matched route pattern instead of the raw path", async () => {
    await request(createApp()).get("/ok/123").expect(200);

    const exposition = await register.metrics();

    expect(exposition).toContain(
      'http_request_duration_seconds_count{method="GET",route="/ok/:id",status_code="200"} 1',
    );
  });

  it("includes the mounted router's base path in the route label", async () => {
    await request(createApp()).get("/api/nested").expect(204);

    const exposition = await register.metrics();

    expect(exposition).toContain('route="/api/nested"');
  });

  it("falls back to 'unmatched' for a request with no matching route", async () => {
    await request(createApp()).get("/does-not-exist").expect(404);

    const exposition = await register.metrics();

    expect(exposition).toContain('route="unmatched"');
  });
});
