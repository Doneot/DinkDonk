import request from "supertest";
import { describe, expect, it } from "vitest";

import { errorResponseSchema } from "../../../http/schemas/responses.js";

import { createTestApp } from "../../helpers/createTestApp.js";

const PROTECTED_ROUTES = [
  ["get", "/api/status"],
  ["get", "/api/notifications/web-push/public-key"],
  ["get", "/api/notifications/channels"],
  ["get", "/api/user-count"],
  ["get", "/api/can-receive-dm"],
  ["get", "/api/streamers/search"],
  ["post", "/api/streamers/info"],
  ["post", "/api/notifications/web-push/subscriptions"],
  ["delete", "/api/notifications/web-push/subscriptions"],
  ["post", "/api/subscriptions"],
  ["delete", "/api/subscriptions"],
  ["post", "/api/subscriptions/set-message"],
] as const;

describe("API authorization", () => {
  it("rejects unauthenticated API requests", async () => {
    const { app } = await createTestApp({ authenticated: false });

    const response = await request(app).get("/api/status").expect(401);

    expect(errorResponseSchema.parse(response.body)).toEqual({
      error: "unauthorized",
      message: "Unauthorized",
    });
  });

  it.each(PROTECTED_ROUTES)(
    "requires authentication for %s %s",
    async (method, path) => {
      const { app } = await createTestApp({ authenticated: false });

      await request(app)[method](path).expect(401);
    },
  );

  it("allows an authenticated request through to the route", async () => {
    const { app } = await createTestApp();

    await request(app).get("/api/status").expect(200);
  });
});
