import type { Subscription } from "../../modules/subscriptions/domain/Subscription.js";

import { TEST_STREAMER_ID } from "../constants.js";

export function buildSubscription(
  overrides: Partial<Subscription> = {},
): Subscription {
  return {
    id: TEST_STREAMER_ID,
    notification_message: "{streamer} is live!",
    ...overrides,
  };
}
