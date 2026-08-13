import { afterEach, describe, expect, it, vi } from "vitest";

import {
  subscribeResponseSchema,
  unsubscribeResponseSchema,
  updateSubscriptionResponseSchema,
} from "../../../http/schemas/responses.js";
import { register } from "../../../infrastructure/metrics/prometheus.js";
import type { TestState } from "../../fixtures/seedState.js";
import { createTestApp } from "../../helpers/createTestApp.js";
import { TestClient } from "../../helpers/TestClient.js";

async function createClient(state?: TestState) {
  const ctx = await createTestApp(state ? { state } : {});

  // POST /api/subscriptions now confirms streamerId names a real streamer
  // before subscribing (defense in depth against path-injection); stub it
  // to resolve any requested id so existing subscribe-flow tests below
  // don't need to know about Twitch resolution to exercise the route.
  vi.spyOn(ctx.twitch, "fetchStreamers").mockImplementation((ids) =>
    Promise.resolve(
      (Array.isArray(ids) ? ids : [ids]).map((id) => ({
        id,
        login: `login-${id}`,
        display_name: `Display ${id}`,
        profile_image_url: "https://example.com/avatar.png",
      })),
    ),
  );

  return { ctx, client: new TestClient(ctx.app, ctx.repositories) };
}

const EXISTING_SUBSCRIPTION: TestState = {
  subscriptions: [{ userId: "user-1", streamerId: "streamer_1" }],
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
      .send({ streamerId: "streamer_1" })
      .expect(201);

    expect(subscribeResponseSchema.parse(response.body)).toEqual({
      createdStreamer: true,
    });
    await expect(
      ctx.repositories.users.getSubscription("user-1", "streamer_1"),
    ).resolves.toEqual({ id: "streamer_1", notification_message: "" });
    expect(await register.metrics()).toContain(
      'streamer_subscriptions_total{action="subscribed"} 1',
    );
  });

  it("does not record a metric for a rejected subscription attempt", async () => {
    const { client } = await createClient(EXISTING_SUBSCRIPTION);

    await client
      .post("/api/subscriptions")
      .send({ streamerId: "streamer_1" })
      .expect(409);

    expect(await register.metrics()).not.toContain(
      "streamer_subscriptions_total{action=",
    );
  });

  it("reports an existing streamer as not newly created", async () => {
    const { client } = await createClient({
      subscriptions: [{ userId: "user-2", streamerId: "streamer_1" }],
    });

    const response = await client
      .post("/api/subscriptions")
      .send({ streamerId: "streamer_1" })
      .expect(201);

    expect(response.body).toEqual({ createdStreamer: false });
  });

  it("rejects a duplicate subscription with 409", async () => {
    const { client } = await createClient(EXISTING_SUBSCRIPTION);

    const response = await client
      .post("/api/subscriptions")
      .send({ streamerId: "streamer_1" })
      .expect(409);

    expect(response.body).toEqual({
      error: "conflict",
      message: "You're already subscribed to this streamer.",
    });
  });

  it("trims the streamer id before persisting", async () => {
    const { ctx, client } = await createClient();

    await client
      .post("/api/subscriptions")
      .send({ streamerId: "  streamer_1  " })
      .expect(201);

    await expect(
      ctx.repositories.users.getSubscription("user-1", "streamer_1"),
    ).resolves.not.toBeNull();
  });

  it("surfaces a repository failure as a 500", async () => {
    const { ctx, client } = await createClient();

    vi.spyOn(ctx.repositories.users, "subscribe").mockRejectedValue(
      new Error("firestore unavailable"),
    );

    await client
      .post("/api/subscriptions")
      .send({ streamerId: "streamer_1" })
      .expect(500);
  });

  it("rejects a streamerId Twitch doesn't recognize, without creating a subscription", async () => {
    const { ctx, client } = await createClient();

    vi.spyOn(ctx.twitch, "fetchStreamers").mockResolvedValue([]);

    const subscribe = vi.spyOn(ctx.repositories.users, "subscribe");

    const response = await client
      .post("/api/subscriptions")
      .send({ streamerId: "unknown_streamer" })
      .expect(404);

    expect(subscribe).not.toHaveBeenCalled();
    expect(response.body).toEqual({
      error: "not_found",
      message: "We couldn't find that streamer.",
    });
  });
});

describe("DELETE /api/subscriptions", () => {
  it("removes the subscription and reports the remaining subscribers", async () => {
    const { ctx, client } = await createClient(EXISTING_SUBSCRIPTION);

    const response = await client
      .delete("/api/subscriptions")
      .query({ streamerId: "streamer_1" })
      .expect(200);

    expect(unsubscribeResponseSchema.parse(response.body)).toEqual({
      usersLeft: 0,
    });
    await expect(
      ctx.repositories.users.getSubscription("user-1", "streamer_1"),
    ).resolves.toBeNull();
    expect(await register.metrics()).toContain(
      'streamer_subscriptions_total{action="unsubscribed"} 1',
    );
  });

  it("reports the subscribers that remain for the streamer", async () => {
    const { client } = await createClient({
      subscriptions: [
        { userId: "user-1", streamerId: "streamer_1" },
        { userId: "user-2", streamerId: "streamer_1" },
      ],
    });

    const response = await client
      .delete("/api/subscriptions")
      .query({ streamerId: "streamer_1" })
      .expect(200);

    expect(response.body).toEqual({ usersLeft: 1 });
  });

  it("rejects an unsubscribe for a user with no subscriptions", async () => {
    const { client } = await createClient();

    const response = await client
      .delete("/api/subscriptions")
      .query({ streamerId: "streamer_1" })
      .expect(404);

    expect(response.body).toEqual({
      error: "not_found",
      message: "We couldn't find your account.",
    });
  });
});

describe("POST /api/subscriptions/set-message", () => {
  it("updates the notification message on the subscription", async () => {
    const { ctx, client } = await createClient(EXISTING_SUBSCRIPTION);

    const response = await client
      .post("/api/subscriptions/set-message")
      .send({ id: "streamer_1", message: "  %s just went live  " })
      .expect(200);

    expect(updateSubscriptionResponseSchema.parse(response.body)).toEqual({});
    await expect(
      ctx.repositories.users.getSubscription("user-1", "streamer_1"),
    ).resolves.toMatchObject({ notification_message: "%s just went live" });
  });

  it("clears the message when none is supplied", async () => {
    const { ctx, client } = await createClient({
      subscriptions: [
        {
          userId: "user-1",
          streamerId: "streamer_1",
          notificationMessage: "old message",
        },
      ],
    });

    await client
      .post("/api/subscriptions/set-message")
      .send({ id: "streamer_1" })
      .expect(200);

    await expect(
      ctx.repositories.users.getSubscription("user-1", "streamer_1"),
    ).resolves.toMatchObject({ notification_message: "" });
  });

  it("rejects a message for an unknown subscription", async () => {
    const { client } = await createClient({
      subscriptions: [{ userId: "user-1", streamerId: "streamer_2" }],
    });

    const response = await client
      .post("/api/subscriptions/set-message")
      .send({ id: "streamer_1", message: "hello" })
      .expect(404);

    expect(response.body).toEqual({
      error: "not_found",
      message: "We couldn't find that subscription.",
    });
  });

  it("rejects a message for a user with no subscriptions", async () => {
    const { client } = await createClient();

    const response = await client
      .post("/api/subscriptions/set-message")
      .send({ id: "streamer_1", message: "hello" })
      .expect(404);

    expect(response.body).toEqual({
      error: "not_found",
      message: "We couldn't find your account.",
    });
  });
});
