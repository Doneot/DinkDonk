import crypto from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "../../../shared/logger/logger.js";
import {
  buildRevocationEvent,
  buildStreamOnlineEvent,
  buildWebhookVerification,
} from "../../builders/eventSub.js";
import { createEventSubTestApp } from "../../helpers/createEventSubApp.js";
import {
  buildEventSubHeaders,
  sendChallenge,
  sendEventSub,
  sendNotification,
  sendRawEventSub,
  sendRevocation,
  signEventSubMessage,
} from "../../helpers/eventSub.js";

const TEN_MINUTES_MS = 10 * 60 * 1000;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /eventsub", () => {
  describe("signature verification", () => {
    it("rejects a signature produced with the wrong secret", async () => {
      const { app } = createEventSubTestApp();

      await sendNotification({
        app,
        secret: "wrong-secret",
        payload: buildStreamOnlineEvent(),
      }).expect(403);
    });

    it("rejects a malformed signature", async () => {
      const { app, secret } = createEventSubTestApp();
      const body = JSON.stringify(buildStreamOnlineEvent());

      await sendRawEventSub({
        app,
        body,
        headers: {
          ...buildEventSubHeaders({ secret, body }),
          "twitch-eventsub-message-signature": "not-a-signature",
        },
      }).expect(403);
    });

    it("rejects a message older than the freshness window", async () => {
      const { app, secret } = createEventSubTestApp();

      await sendNotification({
        app,
        secret,
        payload: buildStreamOnlineEvent(),
        timestamp: new Date(Date.now() - TEN_MINUTES_MS - 1_000).toISOString(),
      }).expect(403);
    });

    it("never runs handlers for an unverified message", async () => {
      const { app, received } = createEventSubTestApp();

      await sendNotification({
        app,
        secret: "wrong-secret",
        payload: buildStreamOnlineEvent(),
      }).expect(403);

      expect(received).toHaveLength(0);
    });
  });

  describe("header validation", () => {
    it.each([
      "twitch-eventsub-message-id",
      "twitch-eventsub-message-timestamp",
      "twitch-eventsub-message-signature",
      "twitch-eventsub-message-type",
    ])("rejects a request missing %s", async (header) => {
      const { app, secret } = createEventSubTestApp();
      const body = JSON.stringify(buildStreamOnlineEvent());
      const headers: Record<string, string> = buildEventSubHeaders({
        secret,
        body,
      });

      delete headers[header];

      await sendRawEventSub({ app, body, headers }).expect(400);
    });

    it("rejects an unknown message type", async () => {
      const { app, secret } = createEventSubTestApp();
      const body = JSON.stringify(buildStreamOnlineEvent());
      const messageId = crypto.randomUUID();
      const timestamp = new Date().toISOString();

      await sendRawEventSub({
        app,
        body,
        headers: {
          "twitch-eventsub-message-id": messageId,
          "twitch-eventsub-message-timestamp": timestamp,
          "twitch-eventsub-message-type": "channel.chat.message",
          "twitch-eventsub-message-signature": signEventSubMessage({
            secret,
            messageId,
            timestamp,
            body,
          }),
        },
      }).expect(400);
    });
  });

  describe("webhook_callback_verification", () => {
    it("echoes the challenge as plain text", async () => {
      const { app, secret } = createEventSubTestApp();

      const response = await sendChallenge({
        app,
        secret,
        payload: buildWebhookVerification("challenge-token"),
      }).expect(200);

      expect(response.headers["content-type"]).toMatch(/text\/plain/);
      expect(response.text).toBe("challenge-token");
    });

    it("rejects a verification without a challenge", async () => {
      const { app, secret } = createEventSubTestApp();
      const { challenge: _challenge, ...payload } = buildWebhookVerification();

      await sendEventSub({
        app,
        secret,
        payload,
        type: "webhook_callback_verification",
      }).expect(400);
    });
  });

  describe("notification", () => {
    it("dispatches a stream.online event to the handler", async () => {
      const { app, secret, received } = createEventSubTestApp();
      const payload = buildStreamOnlineEvent();

      await sendNotification({ app, secret, payload }).expect(204);

      expect(received).toEqual([
        { type: "stream.online", event: payload.event },
      ]);
    });

    it("acknowledges a subscription type with no registered handler", async () => {
      const { app, secret, received } = createEventSubTestApp();

      await sendNotification({
        app,
        secret,
        payload: {
          ...buildStreamOnlineEvent(),
          subscription: { type: "channel.follow", version: "1" },
        },
      }).expect(204);

      expect(received).toHaveLength(0);
    });

    it("rejects an event payload that fails schema validation", async () => {
      const { app, secret, received } = createEventSubTestApp();

      await sendNotification({
        app,
        secret,
        payload: {
          ...buildStreamOnlineEvent(),
          event: { broadcaster_user_id: "streamer-1" },
        },
      }).expect(400);

      expect(received).toHaveLength(0);
    });

    it("rejects an envelope missing its subscription", async () => {
      const { app, secret } = createEventSubTestApp();
      const body = JSON.stringify({ event: {} });

      const response = await sendRawEventSub({
        app,
        body,
        headers: buildEventSubHeaders({ secret, body }),
      }).expect(400);

      expect(response.body).toMatchObject({
        error: "validation_error",
        message: "Invalid EventSub payload",
        details: { raw: body },
      });
    });

    it("rejects malformed JSON through the error handler", async () => {
      vi.spyOn(logger, "warn").mockReturnValue();

      const { app, secret } = createEventSubTestApp();
      const body = "{ not json";

      const response = await sendRawEventSub({
        app,
        body,
        headers: buildEventSubHeaders({ secret, body }),
      }).expect(400);

      expect(response.body).toMatchObject({
        error: "validation_error",
        message: "Invalid JSON",
      });
    });

    it("surfaces a handler failure as a 500", async () => {
      vi.spyOn(logger, "error").mockReturnValue();

      const { app, secret } = createEventSubTestApp({
        onNotification: () => Promise.reject(new Error("notify failed")),
      });

      const response = await sendNotification({
        app,
        secret,
        payload: buildStreamOnlineEvent(),
      }).expect(500);

      expect(response.body).toMatchObject({
        error: "internal_server_error",
      });
    });
  });

  describe("revocation", () => {
    it("acknowledges a revocation without running handlers", async () => {
      const { app, secret, received } = createEventSubTestApp();

      await sendRevocation({
        app,
        secret,
        payload: buildRevocationEvent(),
      }).expect(204);

      expect(received).toHaveLength(0);
    });
  });

  describe("replay protection", () => {
    it("processes a redelivered message id only once", async () => {
      const { app, secret, received } = createEventSubTestApp();
      const payload = buildStreamOnlineEvent();
      const messageId = crypto.randomUUID();

      await sendNotification({ app, secret, payload, messageId }).expect(204);
      await sendNotification({ app, secret, payload, messageId }).expect(204);

      expect(received).toHaveLength(1);
    });

    it("processes distinct message ids independently", async () => {
      const { app, secret, received } = createEventSubTestApp();
      const payload = buildStreamOnlineEvent();

      await sendNotification({ app, secret, payload }).expect(204);
      await sendNotification({ app, secret, payload }).expect(204);

      expect(received).toHaveLength(2);
    });

    it("re-processes a redelivery after the first attempt's handler failed", async () => {
      vi.spyOn(logger, "error").mockReturnValue();

      let attempt = 0;
      const { app, secret } = createEventSubTestApp({
        onNotification: () => {
          attempt += 1;

          return attempt === 1
            ? Promise.reject(new Error("transient failure"))
            : Promise.resolve();
        },
      });
      const payload = buildStreamOnlineEvent();
      const messageId = crypto.randomUUID();

      await sendNotification({ app, secret, payload, messageId }).expect(500);

      // Twitch retries a delivery that didn't get a 2xx; since the first
      // attempt's dispatch failure released the reservation, the retry with
      // the same message id must reach the handler again rather than being
      // silently treated as an already-handled duplicate.
      await sendNotification({ app, secret, payload, messageId }).expect(204);

      expect(attempt).toBe(2);
    });

    it("does not reserve message ids for unverified requests", async () => {
      const { app, secret, received } = createEventSubTestApp();
      const payload = buildStreamOnlineEvent();
      const messageId = crypto.randomUUID();

      await sendNotification({
        app,
        secret: "wrong-secret",
        payload,
        messageId,
      }).expect(403);

      await sendNotification({ app, secret, payload, messageId }).expect(204);

      expect(received).toHaveLength(1);
    });
  });
});
