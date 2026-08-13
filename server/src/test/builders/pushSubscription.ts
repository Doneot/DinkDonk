import type { PushSubscription } from "../../modules/notifications/domain/PushSubscription.js";
import { TEST_USER_ID } from "../constants.js";

export function buildPushSubscription(
  overrides: Partial<PushSubscription> = {},
): PushSubscription {
  return {
    id: TEST_USER_ID,

    subscription: {
      endpoint: "https://example.com/push/123",

      keys: {
        p256dh: "test-p256dh-key",
        auth: "test-auth-key",
      },
    },

    userAgent: "Vitest",
    ...overrides,
  };
}
