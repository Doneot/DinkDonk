import type { EventSubEnvelope } from "../../http/schemas/eventSub.js";

export function buildStreamOnlineEvent(
  overrides: Partial<EventSubEnvelope["event"]> = {},
): EventSubEnvelope {
  return {
    subscription: {
      type: "stream.online",
      version: "1",
    },

    event: {
      broadcaster_user_id: "123456",
      broadcaster_user_login: "test_streamer",
      broadcaster_user_name: "Test Streamer",
      id: "stream-id",
      type: "live",
      started_at: new Date().toISOString(),
      ...overrides,
    },
  };
}

export function buildWebhookVerification(
  challenge = "test-challenge",
): EventSubEnvelope {
  return {
    subscription: {
      type: "stream.online",
      version: "1",
    },

    challenge,

    event: {},
  };
}

export function buildRevocationEvent(): EventSubEnvelope {
  return {
    subscription: {
      type: "stream.online",
      version: "1",
      status: "authorization_revoked",
    },

    event: {},
  };
}
