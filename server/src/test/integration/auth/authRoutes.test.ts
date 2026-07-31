import type { NextFunction, Request, RequestHandler, Response } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { errorResponseSchema } from "../../../http/schemas/responses.js";
import { userResponseSchema } from "../../../http/schemas/responses.js";
import { env } from "../../../shared/config/env.js";

import { buildUser } from "../../builders/user.js";
import { buildIdentity } from "../../builders/auth.js";

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";

// passport is a true external boundary here: the OAuth handshake itself is not
// under test, only what the routes do once a user is (or is not) authenticated.
vi.mock("passport", () => ({
  default: {
    authenticate: (_strategy: string, options?: unknown): RequestHandler =>
      options
        ? (_req: Request, _res: Response, next: NextFunction) => next()
        : (_req: Request, res: Response) => res.redirect(DISCORD_AUTHORIZE_URL),
  },
}));

const { AUTH_TEST_USER, createAuthTestApp } =
  await import("../../helpers/createAuthApp.js");

afterEach(() => {
  env.isProduction = false;
  vi.restoreAllMocks();
});

describe("GET /api/auth/providers", () => {
  it("lists discord, google, and twitch when all are configured", async () => {
    const { app } = await createAuthTestApp();

    const response = await request(app).get("/api/auth/providers").expect(200);

    expect(response.body).toEqual({ providers: ["discord", "google", "twitch"] });
  });
});

describe("GET /api/auth/discord", () => {
  it("hands the browser off to Discord", async () => {
    const { app } = await createAuthTestApp();

    const response = await request(app).get("/api/auth/discord").expect(302);

    expect(response.headers.location).toBe(DISCORD_AUTHORIZE_URL);
  });
});

describe("GET /api/auth/discord/link", () => {
  it("rejects an anonymous request", async () => {
    const { app } = await createAuthTestApp({ authenticated: false });

    await request(app).get("/api/auth/discord/link").expect(401);
  });

  it("hands an authenticated browser off to Discord", async () => {
    const { app } = await createAuthTestApp();

    const response = await request(app)
      .get("/api/auth/discord/link")
      .expect(302);

    expect(response.headers.location).toBe(DISCORD_AUTHORIZE_URL);
  });
});

describe("GET /api/auth/discord/callback", () => {
  it("keeps the stored DM capability and redirects to the dashboard", async () => {
    const { app, repositories, discord } = await createAuthTestApp({
      state: { users: [buildUser({ id: "user-1", canReceiveDM: true })] },
    });

    const canSend = vi.spyOn(discord, "canSendDirectMessage");

    const response = await request(app)
      .get("/api/auth/discord/callback")
      .expect(302);

    expect(response.headers.location).toBe("http://localhost:5000/dashboard");
    expect(canSend).not.toHaveBeenCalled();
    await expect(repositories.users.getUser("user-1")).resolves.toMatchObject({
      canReceiveDM: true,
    });
  });

  it("keeps a stored negative DM capability without re-checking Discord", async () => {
    const { app, discord } = await createAuthTestApp({
      state: { users: [buildUser({ id: "user-1", canReceiveDM: false })] },
    });

    const canSend = vi.spyOn(discord, "canSendDirectMessage");

    await request(app).get("/api/auth/discord/callback").expect(302);

    expect(canSend).not.toHaveBeenCalled();
  });

  it("asks Discord about DM capability for a first-time user", async () => {
    const { app, repositories, discord } = await createAuthTestApp();

    const canSend = vi.spyOn(discord, "canSendDirectMessage");

    await request(app).get("/api/auth/discord/callback").expect(302);

    expect(canSend).toHaveBeenCalledWith("user-1");
    await expect(repositories.users.getUser("user-1")).resolves.toMatchObject({
      canReceiveDM: true,
    });
  });

  it("stores a negative Discord answer for a first-time user", async () => {
    const { app, repositories, discord } = await createAuthTestApp();

    vi.spyOn(discord, "canSendDirectMessage").mockResolvedValue(false);

    await request(app).get("/api/auth/discord/callback").expect(302);

    await expect(repositories.users.getUser("user-1")).resolves.toMatchObject({
      canReceiveDM: false,
    });
  });

  it("redirects to the public server url in production", async () => {
    const { app } = await createAuthTestApp();

    env.isProduction = true;

    const response = await request(app)
      .get("/api/auth/discord/callback")
      .expect(302);

    expect(response.headers.location).toBe(`${env.serverUrl}/dashboard`);
  });

  it("rejects a callback without an authenticated user", async () => {
    const { app } = await createAuthTestApp({ authenticated: false });

    await request(app).get("/api/auth/discord/callback").expect(401);
  });

  it("surfaces a repository failure as a 500", async () => {
    const { app, repositories } = await createAuthTestApp();

    vi.spyOn(repositories.users, "getUser").mockRejectedValue(
      new Error("firestore unavailable"),
    );

    await request(app).get("/api/auth/discord/callback").expect(500);
  });
});

describe("GET /api/auth/google/callback", () => {
  it("does not ask Discord about DM capability for a Google-only identity", async () => {
    const { app, repositories, discord } = await createAuthTestApp({
      identity: buildIdentity({
        uid: "user-1",
        discord: undefined,
        google: {
          id: "google-1",
          email: "tester@example.com",
          name: "tester",
          picture: "",
        },
      }),
    });

    const canSend = vi.spyOn(discord, "canSendDirectMessage");

    const response = await request(app)
      .get("/api/auth/google/callback")
      .expect(302);

    expect(response.headers.location).toBe("http://localhost:5000/dashboard");
    expect(canSend).not.toHaveBeenCalled();
    await expect(repositories.users.getUser("user-1")).resolves.toMatchObject({
      canReceiveDM: false,
    });
  });
});

describe("GET /api/auth/twitch/callback", () => {
  it("does not ask Discord about DM capability for a Twitch-only identity", async () => {
    const { app, repositories, discord } = await createAuthTestApp({
      identity: buildIdentity({
        uid: "user-1",
        discord: undefined,
        twitch: {
          id: "twitch-1",
          login: "tester",
          displayName: "tester",
          profileImageUrl: "",
        },
      }),
    });

    const canSend = vi.spyOn(discord, "canSendDirectMessage");

    const response = await request(app)
      .get("/api/auth/twitch/callback")
      .expect(302);

    expect(response.headers.location).toBe("http://localhost:5000/dashboard");
    expect(canSend).not.toHaveBeenCalled();
    await expect(repositories.users.getUser("user-1")).resolves.toMatchObject({
      canReceiveDM: false,
    });
  });
});

describe("GET /api/auth/user", () => {
  it("merges the session identity with the stored user record", async () => {
    const { app } = await createAuthTestApp({
      state: {
        users: [
          buildUser({ id: "user-1", canReceiveDM: true, subscriptions: [] }),
        ],
      },
    });

    const response = await request(app).get("/api/auth/user").expect(200);

    // Asserted against the raw body, not schema.parse()'s output: a Zod
    // object schema silently strips unrecognized keys, so parsing first
    // would hide a regression that leaked accessToken/refreshToken back into
    // the response instead of catching it.
    expect(response.body).not.toHaveProperty("accessToken");
    expect(response.body).not.toHaveProperty("refreshToken");

    expect(userResponseSchema.parse(response.body)).toEqual({
      id: "user-1",
      email: AUTH_TEST_USER.email,
      emailVerified: AUTH_TEST_USER.emailVerified,
      name: AUTH_TEST_USER.name,
      avatarUrl: AUTH_TEST_USER.avatarUrl,
      providers: AUTH_TEST_USER.providers,
      canReceiveDM: true,
      subscriptions: [],
    });
  });

  it("self-heals by creating a default user record when one is missing", async () => {
    const { app, repositories } = await createAuthTestApp();

    const response = await request(app).get("/api/auth/user").expect(200);

    // See the equivalent check above: asserted against the raw body so a
    // future token leak can't hide behind schema.parse()'s key-stripping.
    expect(response.body).not.toHaveProperty("accessToken");
    expect(response.body).not.toHaveProperty("refreshToken");

    expect(userResponseSchema.parse(response.body)).toEqual({
      id: AUTH_TEST_USER.id,
      email: AUTH_TEST_USER.email,
      emailVerified: AUTH_TEST_USER.emailVerified,
      name: AUTH_TEST_USER.name,
      avatarUrl: AUTH_TEST_USER.avatarUrl,
      providers: AUTH_TEST_USER.providers,
      canReceiveDM: true,
      subscriptions: [],
    });

    await expect(
      repositories.users.getUser(AUTH_TEST_USER.id),
    ).resolves.toMatchObject({ canReceiveDM: true, subscriptions: [] });
  });

  it("surfaces a repository failure as a 500 even after attempting to self-heal", async () => {
    const { app, repositories } = await createAuthTestApp();

    vi.spyOn(repositories.users, "updateUser").mockRejectedValue(
      new Error("firestore unavailable"),
    );

    const response = await request(app).get("/api/auth/user").expect(500);

    expect(errorResponseSchema.parse(response.body)).toMatchObject({
      error: "internal_server_error",
    });
  });

  it("rejects an anonymous request", async () => {
    const { app } = await createAuthTestApp({ authenticated: false });

    const response = await request(app).get("/api/auth/user").expect(401);

    expect(errorResponseSchema.parse(response.body)).toMatchObject({
      error: "unauthorized",
    });
  });
});

describe("POST /api/auth/logout", () => {
  it("destroys the session and clears the session cookie", async () => {
    const { app } = await createAuthTestApp();

    const response = await request(app).post("/api/auth/logout").expect(200);

    expect(response.body).toEqual({ ok: true });
    const setCookie = response.headers["set-cookie"] as unknown as
      string[] | undefined;

    expect(setCookie?.join(";")).toContain("connect.sid=;");
  });

  it("returns 500 when passport fails to log the user out", async () => {
    const { app } = await createAuthTestApp({
      logoutError: new Error("logout failed"),
    });

    const response = await request(app).post("/api/auth/logout").expect(500);

    expect(errorResponseSchema.parse(response.body)).toMatchObject({
      error: "internal_server_error",
    });
  });

  it("rejects an anonymous request", async () => {
    const { app } = await createAuthTestApp({ authenticated: false });

    const response = await request(app).post("/api/auth/logout").expect(401);

    expect(errorResponseSchema.parse(response.body)).toMatchObject({
      error: "unauthorized",
    });
  });

  it("disconnects the user's live sockets once the session is destroyed", async () => {
    const disconnectUser = vi.fn();
    const { app } = await createAuthTestApp({ disconnectUser });

    await request(app).post("/api/auth/logout").expect(200);

    expect(disconnectUser).toHaveBeenCalledWith(AUTH_TEST_USER.id);
  });

  it("does not disconnect any sockets when passport fails to log the user out", async () => {
    const disconnectUser = vi.fn();
    const { app } = await createAuthTestApp({
      disconnectUser,
      logoutError: new Error("logout failed"),
    });

    await request(app).post("/api/auth/logout").expect(500);

    expect(disconnectUser).not.toHaveBeenCalled();
  });
});
