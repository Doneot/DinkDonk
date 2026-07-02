import type { PushSubscription } from "../../modules/notifications/domain/PushSubscription.js";

export function buildPushSubscription(
  overrides: Partial<PushSubscription> = {},
): PushSubscription {
  return {
    id: "user-1",

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
