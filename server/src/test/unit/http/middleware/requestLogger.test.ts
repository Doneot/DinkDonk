import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requestId } from "../../../../http/middleware/requestId.js";
import { requestLogger } from "../../../../http/middleware/requestLogger.js";
import { logger } from "../../../../shared/logger/logger.js";

// The suite silences the logger globally; these tests need it to actually emit
// so that the serializers and level selection run.
beforeAll(() => {
  logger.level = "info";
});

afterAll(() => {
  logger.level = "silent";
});

function createApp() {
  const app = express();

  app.use(requestId);
  app.use(requestLogger);

  app.get("/ok", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/bad-request", (_req, res) => {
    res.sendStatus(400);
  });

  app.get("/boom", () => {
    throw new Error("boom");
  });

  return app;
}

describe("requestLogger", () => {
  it("attaches a logger without altering successful responses", async () => {
    const response = await request(createApp()).get("/ok").expect(200);

    expect(response.body).toEqual({ ok: true });
    expect(response.headers["x-request-id"]).toBeDefined();
  });

  it("passes client errors through", async () => {
    await request(createApp()).get("/bad-request").expect(400);
  });

  it("passes server errors through", async () => {
    await request(createApp()).get("/boom").expect(500);
  });

  it("logs requests that never received a request id", async () => {
    const app = express();

    app.use(requestLogger);
    app.get("/ok", (_req, res) => {
      res.sendStatus(200);
    });

    await request(app).get("/ok").expect(200);
  });
});
