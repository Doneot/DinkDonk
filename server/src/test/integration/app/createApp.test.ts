import crypto from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../../http/createApp.js";
import { createSessionMiddleware } from "../../../http/configureMiddleware.js";
import type { StreamNotificationService } from "../../../modules/notifications/application/StreamNotificationService.js";
import type { StreamerLiveStateService } from "../../../modules/streamers/application/StreamerLiveStateService.js";
import { env } from "../../../shared/config/env.js";
import { logger } from "../../../shared/logger/logger.js";

import { buildStreamOnlineEvent } from "../../builders/eventSub.js";
import { createTestContainer } from "../../helpers/createTestContainer.js";
import { buildEventSubHeaders } from "../../helpers/eventSub.js";
import { FakeFirestore } from "../../helpers/fakeFirestore.js";

const WEBHOOK_SECRET = "twitch-webhook-secret";

function setup() {
  const container = createTestContainer();
  const handleStreamOnline = vi.fn().mockResolvedValue(undefined);

  const app = createApp({
    sessionMiddleware: createSessionMiddleware(
      new FakeFirestore().asFirestore(),
    ),
    repositories: container.repositories,
    twitch: container.twitch,
    discord: container.discord,
    services: {
      streamNotification: {
        handleStreamOnline,
      } as unknown as StreamNotificationService,
      streamerLiveState: {
        handleStreamOnline: vi.fn().mockResolvedValue(undefined),
        handleStreamOffline: vi.fn().mockResolvedValue(undefined),
      } as unknown as StreamerLiveStateService,
    },
  });

  return { app, handleStreamOnline, repositories: container.repositories };
}

function postEventSub(
  app: ReturnType<typeof setup>["app"],
  { secret = WEBHOOK_SECRET }: { secret?: string } = {},
) {
  const body = JSON.stringify(buildStreamOnlineEvent());

  return request(app)
    .post("/eventsub")
    .set(
      buildEventSubHeaders({
        secret,
        body,
        messageId: crypto.randomUUID(),
      }),
    )
    .set("Content-Type", "application/json")
    .send(body);
}

const ORIGINAL_CLIENT_ORIGINS = env.clientOrigins;

afterEach(() => {
  env.prometheus.enabled = false;
  env.prometheus.metricsToken = undefined;
  env.requestLogging.enabled = false;
  env.isProduction = false;
  env.clientOrigins = ORIGINAL_CLIENT_ORIGINS;
  vi.restoreAllMocks();
});

describe("createApp", () => {
  describe("middleware stack", () => {
    it("stamps a request id on every response", async () => {
      const { app } = setup();

      const response = await request(app).get("/health/live").expect(200);

      expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("applies the security headers from helmet", async () => {
      const { app } = setup();

      const response = await request(app).get("/health/live").expect(200);

      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBeDefined();
    });

    it("applies the security headers from helmet even to CORS preflight responses", async () => {
      // helmet must run ahead of cors in the middleware stack, otherwise the
      // OPTIONS preflight that cors's middleware answers directly (short-
      // circuiting the rest of the chain) never gets helmet's headers.
      const { app } = setup();

      const response = await request(app)
        .options("/health/live")
        .set("Origin", env.clientOrigin)
        .set("Access-Control-Request-Method", "GET")
        .expect(204);

      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBeDefined();
    });

    it("allows credentialed requests from the configured client origin", async () => {
      const { app } = setup();

      const response = await request(app)
        .get("/health/live")
        .set("Origin", env.clientOrigin)
        .expect(200);

      expect(response.headers["access-control-allow-origin"]).toBe(
        env.clientOrigin,
      );
      expect(response.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("allows credentialed requests from any configured client origin, not just the first", async () => {
      const secondOrigin = "https://www.example.com";

      env.clientOrigins = [env.clientOrigin, secondOrigin];

      const { app } = setup();

      const response = await request(app)
        .get("/health/live")
        .set("Origin", secondOrigin)
        .expect(200);

      expect(response.headers["access-control-allow-origin"]).toBe(
        secondOrigin,
      );
      expect(response.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("rejects a credentialed request from an origin outside the configured list", async () => {
      const { app } = setup();

      const response = await request(app)
        .get("/health/live")
        .set("Origin", "https://not-allowed.example.com")
        .expect(200);

      expect(
        response.headers["access-control-allow-origin"],
      ).toBeUndefined();
    });
  });

  describe("routes", () => {
    it("serves the liveness probe", async () => {
      const { app } = setup();

      await request(app).get("/health/live").expect(200);
    });

    it("serves the readiness probe", async () => {
      const { app } = setup();

      await request(app).get("/health/ready").expect(200);
    });

    it("serves the OpenAPI documentation outside production", async () => {
      const { app } = setup();

      const response = await request(app).get("/docs/").expect(200);

      expect(response.text).toContain("swagger");
    });

    it("does not expose the OpenAPI documentation in production", async () => {
      env.isProduction = true;

      const { app } = setup();

      await request(app).get("/docs/").expect(404);
    });

    it("redirects a failed login back to the client", async () => {
      const { app } = setup();

      const response = await request(app).get("/login-failed").expect(302);

      expect(response.headers.location).toBe(env.clientOrigin);
    });

    it("hands unauthenticated Discord logins off to the OAuth provider", async () => {
      const { app } = setup();

      const response = await request(app).get("/api/auth/discord").expect(302);

      expect(response.headers.location).toContain("discord.com");
    });

    it("rejects unauthenticated API requests", async () => {
      const { app } = setup();

      const response = await request(app).get("/api/status").expect(401);

      expect(response.body).toMatchObject({ error: "unauthorized" });
    });

    it("also serves /api/v1 as a non-breaking alias of /api", async () => {
      const { app } = setup();

      const response = await request(app).get("/api/v1/status").expect(401);

      expect(response.body).toMatchObject({ error: "unauthorized" });
    });

    it("also serves /api/v1/auth as a non-breaking alias of /api/auth", async () => {
      const { app } = setup();

      const response = await request(app)
        .get("/api/v1/auth/discord")
        .expect(302);

      expect(response.headers.location).toContain("discord.com");
    });

    it("does not expose metrics unless Prometheus is enabled", async () => {
      const { app } = setup();

      await request(app).get("/metrics").expect(404);
    });

    it("exposes metrics when Prometheus is enabled", async () => {
      env.prometheus.enabled = true;

      const { app } = setup();

      const response = await request(app).get("/metrics").expect(200);

      expect(response.text).toContain("eventsub_requests_total");
    });

    it("requires a bearer token for metrics when one is configured", async () => {
      env.prometheus.enabled = true;
      env.prometheus.metricsToken = "a-real-metrics-token-1234567890";

      const { app } = setup();

      await request(app).get("/metrics").expect(401);

      const response = await request(app)
        .get("/metrics")
        .set("Authorization", "Bearer a-real-metrics-token-1234567890")
        .expect(200);

      expect(response.text).toContain("eventsub_requests_total");
    });

    it("skips the request logger unless request logging is enabled", async () => {
      const child = vi.spyOn(logger, "child");
      const { app } = setup();

      await request(app).get("/health/live").expect(200);

      expect(child).not.toHaveBeenCalled();
    });

    it("attaches the request logger when request logging is enabled", async () => {
      env.requestLogging.enabled = true;

      const child = vi.spyOn(logger, "child");
      const { app } = setup();

      await request(app).get("/health/live").expect(200);

      expect(child).toHaveBeenCalled();
    });
  });

  describe("EventSub webhook", () => {
    it("routes a verified notification to the stream notification service", async () => {
      const { app, handleStreamOnline } = setup();

      await postEventSub(app).expect(204);

      expect(handleStreamOnline).toHaveBeenCalledOnce();
      expect(handleStreamOnline.mock.calls[0]?.[0]).toMatchObject({
        broadcaster_user_id: "streamer-1",
      });
    });

    it("rejects a notification signed with the wrong secret", async () => {
      const { app, handleStreamOnline } = setup();

      await postEventSub(app, { secret: "wrong-secret" }).expect(403);

      expect(handleStreamOnline).not.toHaveBeenCalled();
    });

    it("is reachable without authentication", async () => {
      const { app } = setup();

      await postEventSub(app).expect(204);
    });
  });
});
