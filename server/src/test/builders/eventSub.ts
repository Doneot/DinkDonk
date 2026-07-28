import type { EventSubEnvelope } from "../../http/schemas/eventSub.js";

import { TEST_STREAMER_ID } from "../constants.js";

const DEFAULT_STARTED_AT = "2024-01-01T12:00:00.000Z";

export function buildStreamOnlineEvent(
  overrides: Partial<EventSubEnvelope["event"]> = {},
): EventSubEnvelope {
  return {
    subscription: {
      type: "stream.online",
      version: "1",
    },

    event: {
      broadcaster_user_id: TEST_STREAMER_ID,
      broadcaster_user_login: "test_streamer",
      broadcaster_user_name: "Test Streamer",
      id: "stream-id",
      type: "live",
      started_at: DEFAULT_STARTED_AT,
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
  };
}

export function buildRevocationEvent(): EventSubEnvelope {
  return {
    subscription: {
      type: "stream.online",
      version: "1",
      status: "authorization_revoked",
    },
  };
}
