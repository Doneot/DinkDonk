import { describe, expect, it } from "vitest";

import { openApiDocument } from "../../../docs/openapi.js";

describe("openApiDocument", () => {
  it("builds a valid OpenAPI 3.0 document without throwing", () => {
    expect(openApiDocument.openapi).toBe("3.0.0");
    expect(openApiDocument.info).toMatchObject({ title: "DinkDonk API" });
  });

  it("documents every route actually mounted by the API", () => {
    const paths = Object.keys(openApiDocument.paths ?? {});

    expect(paths).toEqual(
      expect.arrayContaining([
        "/api/auth/discord",
        "/api/auth/discord/callback",
        "/api/auth/user",
        "/api/auth/logout",
        "/api/status",
        "/api/user-count",
        "/api/can-receive-dm",
        "/api/streamers/search",
        "/api/streamers/info",
        "/api/subscriptions",
        "/api/subscriptions/set-message",
        "/eventsub",
      ]),
    );
    expect(paths.length).toBeGreaterThan(10);
  });

  it("also documents the /api/v1 alias configureRoutes mounts alongside /api", () => {
    const paths = Object.keys(openApiDocument.paths ?? {});

    expect(paths).toEqual(
      expect.arrayContaining([
        "/api/v1/auth/discord",
        "/api/v1/auth/user",
        "/api/v1/status",
        "/api/v1/subscriptions",
      ]),
    );
  });

  it("does not alias non-/api routes (e.g. the unversioned EventSub webhook)", () => {
    const paths = Object.keys(openApiDocument.paths ?? {});

    expect(paths).not.toContain("/api/v1/eventsub");
  });

  it("declares the cookie session security scheme", () => {
    expect(openApiDocument.components?.securitySchemes).toMatchObject({
      cookieAuth: { type: "apiKey", in: "cookie", name: "connect.sid" },
    });
  });

  it("does not publish the internal AuthUser record schema (it carries OAuth token field names)", () => {
    expect(openApiDocument.components?.schemas).not.toHaveProperty("AuthUser");
  });
});
