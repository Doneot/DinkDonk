import { afterEach, describe, expect, it, vi } from "vitest";

import {
  subscribeResponseSchema,
  unsubscribeResponseSchema,
  updateSubscriptionResponseSchema,
} from "../../../http/schemas/responses.js";

import { createTestApp } from "../../helpers/createTestApp.js";
import { TestClient } from "../../helpers/TestClient.js";
import type { TestState } from "../../fixtures/seedState.js";
import { register } from "../../../infrastructure/metrics/prometheus.js";

async function createClient(state?: TestState) {
  const ctx = await createTestApp(state ? { state } : {});

  return { ctx, client: new TestClient(ctx.app, ctx.repositories) };
}

const EXISTING_SUBSCRIPTION: TestState = {
  subscriptions: [{ userId: "user-1", streamerId: "streamer-1" }],
};

afterEach(() => {
  vi.restoreAllMocks();
  register.getSingleMetric("streamer_subscriptions_total")?.reset();
});

describe("POST /api/subscriptions", () => {
  it("subscribes the authenticated user and records the streamer", async () => {
    const { ctx, client } = await createClient();

    const response = await client
      .post("/api/subscriptions")
      .send({ streamerId: "streamer-1" })
      .expect(200);

    expect(subscribeResponseSchema.parse(response.body)).toEqual({
      success: true,
      createdStreamer: true,
    });
    await expect(
      ctx.repositories.subscriptions.getSubscription("user-1", "streamer-1"),
    ).resolves.toEqual({ id: "streamer-1", notification_message: "" });
    expect(await register.metrics()).toContain(
      'streamer_subscriptions_total{action="subscribed"} 1',
    );
  });

  it("does not record a metric for a rejected subscription attempt", async () => {
    const { client } = await createClient(EXISTING_SUBSCRIPTION);

    await client
      .post("/api/subscriptions")
      .send({ streamerId: "streamer-1" })
      .expect(400);

    expect(await register.metrics()).not.toContain(
      "streamer_subscriptions_total{action=",
    );
  });

  it("reports an existing streamer as not newly created", async () => {
    const { client } = await createClient({
      subscriptions: [{ userId: "user-2", streamerId: "streamer-1" }],
    });

    const response = await client
      .post("/api/subscriptions")
      .send({ streamerId: "streamer-1" })
      .expect(200);

    expect(response.body).toEqual({ success: true, createdStreamer: false });
  });

  it("rejects a duplicate subscription with 400", async () => {
    const { client } = await createClient(EXISTING_SUBSCRIPTION);

    const response = await client
      .post("/api/subscriptions")
      .send({ streamerId: "streamer-1" })
      .expect(400);

    expect(subscribeResponseSchema.parse(response.body)).toEqual({
      success: false,
      reason: "already_subscribed",
    });
  });

  it("trims the streamer id before persisting", async () => {
    const { ctx, client } = await createClient();

    await client
      .post("/api/subscriptions")
      .send({ streamerId: "  streamer-1  " })
      .expect(200);

    await expect(
      ctx.repositories.subscriptions.getSubscription("user-1", "streamer-1"),
    ).resolves.not.toBeNull();
  });

  it("surfaces a repository failure as a 500", async () => {
    const { ctx, client } = await createClient();

    vi.spyOn(ctx.repositories.subscriptions, "subscribe").mockRejectedValue(
      new Error("firestore unavailable"),
    );

    await client
      .post("/api/subscriptions")
      .send({ streamerId: "streamer-1" })
      .expect(500);
  });
});

describe("DELETE /api/subscriptions", () => {
  it("removes the subscription and reports the remaining subscribers", async () => {
    const { ctx, client } = await createClient(EXISTING_SUBSCRIPTION);

    const response = await client
      .delete("/api/subscriptions")
      .send({ streamerId: "streamer-1" })
      .expect(200);

    expect(unsubscribeResponseSchema.parse(response.body)).toEqual({
      success: true,
      usersLeft: 0,
    });
    await expect(
      ctx.repositories.subscriptions.getSubscription("user-1", "streamer-1"),
    ).resolves.toBeNull();
    expect(await register.metrics()).toContain(
      'streamer_subscriptions_total{action="unsubscribed"} 1',
    );
  });

  it("reports the subscribers that remain for the streamer", async () => {
    const { client } = await createClient({
      subscriptions: [
        { userId: "user-1", streamerId: "streamer-1" },
        { userId: "user-2", streamerId: "streamer-1" },
      ],
    });

    const response = await client
      .delete("/api/subscriptions")
      .send({ streamerId: "streamer-1" })
      .expect(200);

    expect(response.body).toEqual({ success: true, usersLeft: 1 });
  });

  it("rejects an unsubscribe for a user with no subscriptions", async () => {
    const { client } = await createClient();

    const response = await client
      .delete("/api/subscriptions")
      .send({ streamerId: "streamer-1" })
      .expect(400);

    expect(unsubscribeResponseSchema.parse(response.body)).toEqual({
      success: false,
      reason: "user_not_found",
    });
  });
});

describe("POST /api/subscriptions/set-message", () => {
  it("updates the notification message on the subscription", async () => {
    const { ctx, client } = await createClient(EXISTING_SUBSCRIPTION);

    const response = await client
      .post("/api/subscriptions/set-message")
      .send({ id: "streamer-1", message: "  %s just went live  " })
      .expect(200);

    expect(updateSubscriptionResponseSchema.parse(response.body)).toEqual({
      success: true,
    });
    await expect(
      ctx.repositories.subscriptions.getSubscription("user-1", "streamer-1"),
    ).resolves.toMatchObject({ notification_message: "%s just went live" });
  });

  it("clears the message when none is supplied", async () => {
    const { ctx, client } = await createClient({
      subscriptions: [
        {
          userId: "user-1",
          streamerId: "streamer-1",
          notificationMessage: "old message",
        },
      ],
    });

    await client
      .post("/api/subscriptions/set-message")
      .send({ id: "streamer-1" })
      .expect(200);

    await expect(
      ctx.repositories.subscriptions.getSubscription("user-1", "streamer-1"),
    ).resolves.toMatchObject({ notification_message: "" });
  });

  it("rejects a message for an unknown subscription", async () => {
    const { client } = await createClient({
      subscriptions: [{ userId: "user-1", streamerId: "streamer-2" }],
    });

    const response = await client
      .post("/api/subscriptions/set-message")
      .send({ id: "streamer-1", message: "hello" })
      .expect(400);

    expect(updateSubscriptionResponseSchema.parse(response.body)).toEqual({
      success: false,
      reason: "subscription_not_found",
    });
  });

  it("rejects a message for a user with no subscriptions", async () => {
    const { client } = await createClient();

    const response = await client
      .post("/api/subscriptions/set-message")
      .send({ id: "streamer-1", message: "hello" })
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      reason: "user_not_found",
    });
  });
});
