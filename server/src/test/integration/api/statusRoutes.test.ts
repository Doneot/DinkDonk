import { describe, expect, it, vi } from "vitest";

import {
  canReceiveDmResponseSchema,
  statusResponseSchema,
  userCountResponseSchema,
} from "../../../http/schemas/responses.js";
import { buildIdentity } from "../../builders/auth.js";
import { buildUser } from "../../builders/user.js";
import { createTestApp } from "../../helpers/createTestApp.js";
import { TestClient } from "../../helpers/TestClient.js";

async function createClient(options: Parameters<typeof createTestApp>[0] = {}) {
  const ctx = await createTestApp(options);

  return { ctx, client: new TestClient(ctx.app, ctx.repositories) };
}

describe("GET /api/status", () => {
  it("reports the Discord gateway as online", async () => {
    const { client } = await createClient();

    const response = await client.get("/api/status").expect(200);

    expect(statusResponseSchema.parse(response.body)).toEqual({ online: true });
  });

  it("reports the Discord gateway as offline", async () => {
    const { ctx, client } = await createClient();

    ctx.discord.isReady = false;

    const response = await client.get("/api/status").expect(200);

    expect(statusResponseSchema.parse(response.body)).toEqual({
      online: false,
    });
  });
});

describe("GET /api/user-count", () => {
  it("counts only users who can receive direct messages", async () => {
    const { client } = await createClient({
      state: {
        users: [
          buildUser({ id: "user-1", canReceiveDM: true }),
          buildUser({ id: "user-2", canReceiveDM: true }),
          buildUser({ id: "user-3", canReceiveDM: false }),
        ],
      },
    });

    const response = await client.get("/api/user-count").expect(200);

    expect(userCountResponseSchema.parse(response.body)).toEqual({ count: 2 });
  });

  it("returns zero when there are no users", async () => {
    const { client } = await createClient();

    const response = await client.get("/api/user-count").expect(200);

    expect(userCountResponseSchema.parse(response.body)).toEqual({ count: 0 });
  });

  it("surfaces a repository failure as a 500", async () => {
    const { ctx, client } = await createClient();

    vi.spyOn(ctx.repositories.users, "countUsersReceivingDM").mockRejectedValue(
      new Error("firestore unavailable"),
    );

    await client.get("/api/user-count").expect(500);

    vi.restoreAllMocks();
  });
});

describe("POST /api/can-receive-dm", () => {
  it("persists a positive DM check on the user record", async () => {
    const { ctx, client } = await createClient({
      state: { users: [buildUser({ id: "user-1", canReceiveDM: false })] },
    });

    const response = await client.post("/api/can-receive-dm").expect(200);

    expect(canReceiveDmResponseSchema.parse(response.body)).toEqual({
      canReceiveDM: true,
    });
    await expect(
      ctx.repositories.users.getUser("user-1"),
    ).resolves.toMatchObject({ canReceiveDM: true });
  });

  it("persists a negative DM check on the user record", async () => {
    const { ctx, client } = await createClient({
      state: { users: [buildUser({ id: "user-1", canReceiveDM: true })] },
    });

    vi.spyOn(ctx.discord, "canSendDirectMessage").mockResolvedValue(false);

    const response = await client.post("/api/can-receive-dm").expect(200);

    expect(response.body).toEqual({ canReceiveDM: false });
    await expect(
      ctx.repositories.users.getUser("user-1"),
    ).resolves.toMatchObject({ canReceiveDM: false });

    vi.restoreAllMocks();
  });

  it("creates the user record when the check runs for an unknown user", async () => {
    const { ctx, client } = await createClient();

    await client.post("/api/can-receive-dm").expect(200);

    await expect(
      ctx.repositories.users.getUser("user-1"),
    ).resolves.toMatchObject({ id: "user-1", canReceiveDM: true });
  });

  it("surfaces a Discord failure as a 500", async () => {
    const { ctx, client } = await createClient();

    vi.spyOn(ctx.discord, "canSendDirectMessage").mockRejectedValue(
      new Error("discord unavailable"),
    );

    await client.post("/api/can-receive-dm").expect(500);

    vi.restoreAllMocks();
  });

  it("reads the identity once for the whole request instead of once per middleware/handler", async () => {
    const { ctx, client } = await createClient({
      state: { users: [buildUser({ id: "user-1", canReceiveDM: false })] },
    });

    const getIdentity = vi.spyOn(ctx.repositories.identities, "getIdentity");

    await client.post("/api/can-receive-dm").expect(200);

    // Session deserialization (global middleware), ensureFreshToken, and
    // this handler each used to independently fetch identities/{uid} - now
    // they share the one read deserializeUser already did for the request.
    expect(getIdentity).toHaveBeenCalledOnce();

    vi.restoreAllMocks();
  });

  it("reports false without asking Discord for a Google/Twitch-only identity", async () => {
    const { ctx, client } = await createClient({
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

    const canSend = vi.spyOn(ctx.discord, "canSendDirectMessage");

    const response = await client.post("/api/can-receive-dm").expect(200);

    expect(canReceiveDmResponseSchema.parse(response.body)).toEqual({
      canReceiveDM: false,
    });
    expect(canSend).not.toHaveBeenCalled();
    await expect(
      ctx.repositories.users.getUser("user-1"),
    ).resolves.toMatchObject({ canReceiveDM: false });
  });
});
