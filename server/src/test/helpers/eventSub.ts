import crypto from "node:crypto";
import request from "supertest";
import type { Express } from "express";

import type { EventSubEnvelope } from "../../http/schemas/eventSub.js";

export type EventSubMessageType =
  "notification" | "webhook_callback_verification" | "revocation";

export function signEventSubMessage({
  secret,
  messageId,
  timestamp,
  body,
}: {
  secret: string;
  messageId: string;
  timestamp: string;
  body: string;
}): string {
  const hmac = crypto.createHmac("sha256", secret);

  hmac.update(messageId);
  hmac.update(timestamp);
  hmac.update(body);

  return `sha256=${hmac.digest("hex")}`;
}

export function buildEventSubHeaders({
  secret,
  body,
  messageId = crypto.randomUUID(),
  timestamp = new Date().toISOString(),
  type = "notification",
}: {
  secret: string;
  body: string;
  messageId?: string | undefined;
  timestamp?: string | undefined;
  type?: EventSubMessageType;
}) {
  return {
    "twitch-eventsub-message-id": messageId,
    "twitch-eventsub-message-timestamp": timestamp,
    "twitch-eventsub-message-type": type,
    "twitch-eventsub-message-signature": signEventSubMessage({
      secret,
      messageId,
      timestamp,
      body,
    }),
  };
}

type SendRawEventSubOptions = {
  app: Express;
  body: string;
  headers: Record<string, string>;
};

/**
 * Posts an arbitrary body and header set, for cases the typed helpers below
 * cannot express (malformed JSON, missing or unknown headers).
 */
export function sendRawEventSub({
  app,
  body,
  headers,
}: SendRawEventSubOptions) {
  return request(app)
    .post("/eventsub")
    .set(headers)
    .set("Content-Type", "application/json")
    .send(body);
}

type SendEventSubOptions = {
  app: Express;
  secret: string;
  payload: EventSubEnvelope;
  type?: EventSubMessageType;
  messageId?: string;
  timestamp?: string;
};

export function sendEventSub({
  app,
  secret,
  payload,
  type = "notification",
  messageId,
  timestamp,
}: SendEventSubOptions) {
  const body = JSON.stringify(payload);

  return sendRawEventSub({
    app,
    body,
    headers: buildEventSubHeaders({
      secret,
      body,
      type,
      messageId,
      timestamp,
    }),
  });
}

export function sendNotification(options: Omit<SendEventSubOptions, "type">) {
  return sendEventSub({
    ...options,
    type: "notification",
  });
}

export function sendChallenge(options: Omit<SendEventSubOptions, "type">) {
  return sendEventSub({
    ...options,
    type: "webhook_callback_verification",
  });
}

export function sendRevocation(options: Omit<SendEventSubOptions, "type">) {
  return sendEventSub({
    ...options,
    type: "revocation",
  });
}
