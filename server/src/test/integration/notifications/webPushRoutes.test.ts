import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deletePushResponseSchema,
  notificationChannelsResponseSchema,
  publicKeyResponseSchema,
  savePushResponseSchema,
} from "../../../http/schemas/responses.js";

import { buildPushSubscription } from "../../builders/pushSubscription.js";
import { buildUser } from "../../builders/user.js";
import {
  createTestApp,
  TEST_WEB_PUSH_PUBLIC_KEY,
} from "../../helpers/createTestApp.js";
import { TestClient } from "../../helpers/TestClient.js";

const SUBSCRIPTION = {
  endpoint: "https://push.example.com/subscription-1",
  keys: { p256dh: "p256dh-key", auth: "auth-key" },
};

const SUBSCRIPTION_ID = Buffer.from(SUBSCRIPTION.endpoint).toString(
  "base64url",
);

async function createClient(options: Parameters<typeof createTestApp>[0] = {}) {
  const ctx = await createTestApp(options);

  return { ctx, client: new TestClient(ctx.app, ctx.repositories) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/notifications/web-push/public-key", () => {
  it("returns the configured VAPID public key", async () => {
    const { client } = await createClient();

    const response = await client
      .get("/api/notifications/web-push/public-key")
      .expect(200);

    expect(publicKeyResponseSchema.parse(response.body)).toEqual({
      publicKey: TEST_WEB_PUSH_PUBLIC_KEY,
    });
  });

  it("returns 503 when Web Push is not configured", async () => {
    const { client } = await createClient({ webPushPublicKey: "" });

    const response = await client
      .get("/api/notifications/web-push/public-key")
      .expect(503);

    expect(response.body).toEqual({
      error: "service_unavailable",
      message: "Web Push is not configured",
    });
  });
});

describe("GET /api/notifications/channels", () => {
  it("reports both channels as disabled for a brand new user", async () => {
    const { client } = await createClient();

    const response = await client
      .get("/api/notifications/channels")
      .expect(200);

    expect(notificationChannelsResponseSchema.parse(response.body)).toEqual({
      discord: { enabled: false },
      webPush: { enabled: false, subscriptions: 0 },
    });
  });

  it("reports Discord as enabled when the user can receive DMs", async () => {
    const { client } = await createClient({
      state: { users: [buildUser({ id: "user-1", canReceiveDM: true })] },
    });

    const response = await client
      .get("/api/notifications/channels")
      .expect(200);

    expect(response.body).toMatchObject({ discord: { enabled: true } });
  });

  it("counts the registered push subscriptions", async () => {
    const { ctx, client } = await createClient();

    await ctx.repositories.pushSubscriptions.savePushSubscription(
      "user-1",
      SUBSCRIPTION,
    );
    await ctx.repositories.pushSubscriptions.savePushSubscription("user-1", {
      endpoint: "https://push.example.com/subscription-2",
      keys: SUBSCRIPTION.keys,
    });

    const response = await client
      .get("/api/notifications/channels")
      .expect(200);

    expect(response.body).toMatchObject({
      webPush: { enabled: true, subscriptions: 2 },
    });
  });

  it("surfaces a repository failure as a 500", async () => {
    const { ctx, client } = await createClient();

    vi.spyOn(
      ctx.repositories.pushSubscriptions,
      "getPushSubscriptions",
    ).mockRejectedValue(new Error("firestore unavailable"));

    await client.get("/api/notifications/channels").expect(500);
  });
});

describe("POST /api/notifications/web-push/subscriptions", () => {
  it("stores the subscription along with the user agent", async () => {
    const { ctx, client } = await createClient();

    const response = await client
      .post("/api/notifications/web-push/subscriptions")
      .set("user-agent", "Vitest Browser")
      .send({ subscription: SUBSCRIPTION })
      .expect(200);

    expect(savePushResponseSchema.parse(response.body)).toEqual({
      success: true,
      id: SUBSCRIPTION_ID,
    });
    await expect(
      ctx.repositories.pushSubscriptions.getPushSubscriptions("user-1"),
    ).resolves.toEqual([
      {
        id: SUBSCRIPTION_ID,
        subscription: SUBSCRIPTION,
        userAgent: "Vitest Browser",
      },
    ]);
  });

  it("replaces an existing subscription with the same endpoint", async () => {
    const { ctx, client } = await createClient();

    await client
      .post("/api/notifications/web-push/subscriptions")
      .send({ subscription: SUBSCRIPTION })
      .expect(200);
    await client
      .post("/api/notifications/web-push/subscriptions")
      .send({ subscription: SUBSCRIPTION })
      .expect(200);

    await expect(
      ctx.repositories.pushSubscriptions.getPushSubscriptions("user-1"),
    ).resolves.toHaveLength(1);
  });

  it("returns 400 when the repository rejects the subscription", async () => {
    const { ctx, client } = await createClient();

    vi.spyOn(
      ctx.repositories.pushSubscriptions,
      "savePushSubscription",
    ).mockResolvedValue({
      success: false,
      reason: "invalid_push_subscription",
    });

    const response = await client
      .post("/api/notifications/web-push/subscriptions")
      .send({ subscription: SUBSCRIPTION })
      .expect(400);

    expect(savePushResponseSchema.parse(response.body)).toEqual({
      success: false,
      reason: "invalid_push_subscription",
    });
  });
});

describe("DELETE /api/notifications/web-push/subscriptions", () => {
  it("deletes a subscription referenced by id", async () => {
    const { ctx, client } = await createClient();

    await client
      .post("/api/notifications/web-push/subscriptions")
      .send({ subscription: SUBSCRIPTION })
      .expect(200);

    const response = await client
      .delete("/api/notifications/web-push/subscriptions")
      .send({ subscriptionId: SUBSCRIPTION_ID })
      .expect(200);

    expect(deletePushResponseSchema.parse(response.body)).toEqual({
      success: true,
    });
    await expect(
      ctx.repositories.pushSubscriptions.getPushSubscriptions("user-1"),
    ).resolves.toEqual([]);
  });

  it("deletes a subscription referenced by its full payload", async () => {
    const { ctx, client } = await createClient();

    await client
      .post("/api/notifications/web-push/subscriptions")
      .send({ subscription: SUBSCRIPTION })
      .expect(200);

    await client
      .delete("/api/notifications/web-push/subscriptions")
      .send({ subscription: SUBSCRIPTION })
      .expect(200);

    await expect(
      ctx.repositories.pushSubscriptions.getPushSubscriptions("user-1"),
    ).resolves.toEqual([]);
  });

  it("succeeds for a subscription that was never stored", async () => {
    const { client } = await createClient();

    await client
      .delete("/api/notifications/web-push/subscriptions")
      .send({ subscriptionId: "unknown-id" })
      .expect(200);
  });

  it("returns 400 when the repository rejects the deletion", async () => {
    const { ctx, client } = await createClient();

    vi.spyOn(
      ctx.repositories.pushSubscriptions,
      "deletePushSubscription",
    ).mockResolvedValue({ success: false, reason: "invalid_user" });

    const response = await client
      .delete("/api/notifications/web-push/subscriptions")
      .send({ subscriptionId: SUBSCRIPTION_ID })
      .expect(400);

    expect(deletePushResponseSchema.parse(response.body)).toEqual({
      success: false,
      reason: "invalid_user",
    });
  });

  it("leaves other users' subscriptions untouched", async () => {
    const { ctx, client } = await createClient();

    const other = buildPushSubscription({ id: SUBSCRIPTION_ID });

    await ctx.repositories.pushSubscriptions.savePushSubscription(
      "user-2",
      other.subscription,
    );

    await client
      .delete("/api/notifications/web-push/subscriptions")
      .send({ subscriptionId: SUBSCRIPTION_ID })
      .expect(200);

    await expect(
      ctx.repositories.pushSubscriptions.getPushSubscriptions("user-2"),
    ).resolves.toHaveLength(1);
  });
});
