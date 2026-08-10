import { afterEach, describe, expect, it, vi } from "vitest";

import { errorResponseSchema } from "../../../http/schemas/responses.js";

import { createTestApp } from "../../helpers/createTestApp.js";
import { TestClient } from "../../helpers/TestClient.js";

const VALID_PUSH_SUBSCRIPTION = {
  endpoint: "https://fcm.googleapis.com/fcm/send/subscription-1",
  keys: { p256dh: "p256dh-key", auth: "auth-key" },
};

async function createClient() {
  const ctx = await createTestApp();

  return { ctx, client: new TestClient(ctx.app, ctx.repositories) };
}

function expectValidationError(body: unknown) {
  expect(errorResponseSchema.parse(body)).toMatchObject({
    error: "validation_error",
    message: "Bad Request",
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/streamers/search validation", () => {
  it("returns a validation error before calling route dependencies", async () => {
    const { ctx, client } = await createClient();

    const search = vi.spyOn(ctx.twitch, "searchStreamers");

    const response = await client
      .get("/api/streamers/search")
      .query({ query: "" })
      .expect(400);

    expect(search).not.toHaveBeenCalled();
    expectValidationError(response.body);
  });

  it.each([
    ["a missing query", {}],
    ["a whitespace-only query", { query: "   " }],
    ["an over-long query", { query: "a".repeat(101) }],
  ])("rejects %s", async (_label, query) => {
    const { client } = await createClient();

    const response = await client
      .get("/api/streamers/search")
      .query(query)
      .expect(400);

    expectValidationError(response.body);
  });
});

describe("POST /api/streamers/info validation", () => {
  it.each([
    ["a missing ids array", {}],
    ["an empty ids array", { ids: [] }],
    [
      "more than fifty ids",
      { ids: Array.from({ length: 51 }, (_, i) => `s${i}`) },
    ],
    ["a blank id", { ids: [" "] }],
    ["an over-long id", { ids: ["a".repeat(65)] }],
    ["a non-array ids value", { ids: "streamer-1" }],
  ])("rejects %s", async (_label, body) => {
    const { ctx, client } = await createClient();

    const fetchStreamers = vi.spyOn(ctx.twitch, "fetchStreamers");

    const response = await client.post("/api/streamers/info").send(body);

    expect(response.status).toBe(400);
    expect(fetchStreamers).not.toHaveBeenCalled();
    expectValidationError(response.body);
  });
});

describe("malformed request bodies", () => {
  it("returns a 400 instead of a 500 when the JSON body can't be parsed", async () => {
    const { client } = await createClient();

    // body-parser's JSON middleware (not the route's Zod schema) is what
    // rejects this: it throws a plain http-errors SyntaxError carrying a
    // real 400 status that errorHandler must forward instead of flattening
    // to a generic 500.
    const response = await client.agent
      .post("/api/streamers/info")
      .set("Content-Type", "application/json")
      .send("{ not valid json");

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: "bad_request" });
  });
});

describe("subscription payload validation", () => {
  it("POST /api/subscriptions rejects a missing streamer id", async () => {
    const { ctx, client } = await createClient();

    const subscribe = vi.spyOn(ctx.repositories.users, "subscribe");

    const response = await client.post("/api/subscriptions").send({});

    expect(response.status).toBe(400);
    expect(subscribe).not.toHaveBeenCalled();
    expectValidationError(response.body);
  });

  it("DELETE /api/subscriptions rejects a missing streamer id", async () => {
    const { ctx, client } = await createClient();

    const subscribe = vi.spyOn(ctx.repositories.users, "subscribe");

    const response = await client.delete("/api/subscriptions").query({});

    expect(response.status).toBe(400);
    expect(subscribe).not.toHaveBeenCalled();
    expectValidationError(response.body);
  });

  it.each([
    ["a blank streamer id", { streamerId: "   " }],
    ["an over-long streamer id", { streamerId: "a".repeat(65) }],
    ["a non-string streamer id", { streamerId: 42 }],
    ["a streamer id containing a path separator", { streamerId: "abc/def" }],
  ])("POST /api/subscriptions rejects %s", async (_label, body) => {
    const { client } = await createClient();

    const response = await client.post("/api/subscriptions").send(body);

    expect(response.status).toBe(400);
    expectValidationError(response.body);
  });

  it.each([
    ["a missing id", { message: "hello" }],
    ["a blank id", { id: "  ", message: "hello" }],
    ["an over-long message", { id: "streamer-1", message: "a".repeat(501) }],
  ])("POST /api/subscriptions/set-message rejects %s", async (_label, body) => {
    const { client } = await createClient();

    const response = await client
      .post("/api/subscriptions/set-message")
      .send(body);

    expect(response.status).toBe(400);
    expectValidationError(response.body);
  });
});

describe("web push payload validation", () => {
  it.each([
    ["a missing subscription", {}],
    [
      "a non-url endpoint",
      { subscription: { ...VALID_PUSH_SUBSCRIPTION, endpoint: "not-a-url" } },
    ],
    [
      "an endpoint on a host that isn't a known push service (SSRF guard)",
      {
        subscription: {
          ...VALID_PUSH_SUBSCRIPTION,
          endpoint: "http://169.254.169.254/latest/meta-data/",
        },
      },
    ],
    [
      "a host that merely contains, rather than ends with, the WNS suffix (SSRF guard)",
      {
        subscription: {
          ...VALID_PUSH_SUBSCRIPTION,
          endpoint: "https://notify.windows.com.attacker.example/w",
        },
      },
    ],
    [
      "a host that merely contains, rather than ends with, the google.com suffix (SSRF guard)",
      {
        subscription: {
          ...VALID_PUSH_SUBSCRIPTION,
          endpoint: "https://google.com.attacker.example/fcm/send/abc",
        },
      },
    ],
    [
      "missing keys",
      { subscription: { endpoint: VALID_PUSH_SUBSCRIPTION.endpoint } },
    ],
    [
      "a blank p256dh key",
      {
        subscription: {
          ...VALID_PUSH_SUBSCRIPTION,
          keys: { p256dh: "", auth: "auth-key" },
        },
      },
    ],
    [
      "a blank auth key",
      {
        subscription: {
          ...VALID_PUSH_SUBSCRIPTION,
          keys: { p256dh: "p256dh-key", auth: "" },
        },
      },
    ],
  ])("POST rejects %s", async (_label, body) => {
    const { ctx, client } = await createClient();

    const save = vi.spyOn(
      ctx.repositories.pushSubscriptions,
      "savePushSubscription",
    );

    const response = await client
      .post("/api/notifications/web-push/subscriptions")
      .send(body);

    expect(response.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
    expectValidationError(response.body);
  });

  it("accepts a Windows Notification Service endpoint (Edge, some configurations)", async () => {
    const { client } = await createClient();

    const response = await client
      .post("/api/notifications/web-push/subscriptions")
      .send({
        subscription: {
          ...VALID_PUSH_SUBSCRIPTION,
          endpoint: "https://wns2-par02p.notify.windows.com/w/?token=abc",
        },
      });

    expect(response.status).toBe(201);
  });

  it("accepts a Google endpoint outside the googleapis.com zone (e.g. jmt17.google.com)", async () => {
    const { client } = await createClient();

    const response = await client
      .post("/api/notifications/web-push/subscriptions")
      .send({
        subscription: {
          ...VALID_PUSH_SUBSCRIPTION,
          endpoint: "https://jmt17.google.com/fcm/send/abc",
        },
      });

    expect(response.status).toBe(201);
  });

  it.each([
    ["an empty query", {}],
    ["a blank subscription id", { subscriptionId: "   " }],
    ["a blank endpoint", { endpoint: "" }],
    [
      "a subscription id containing a path separator",
      { subscriptionId: "abc/def" },
    ],
  ])("DELETE rejects %s", async (_label, query) => {
    const { client } = await createClient();

    const response = await client
      .delete("/api/notifications/web-push/subscriptions")
      .query(query);

    expect(response.status).toBe(400);
    expectValidationError(response.body);
  });
});
