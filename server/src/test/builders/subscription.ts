import type { Subscription } from "../../modules/subscriptions/domain/Subscription.js";

export function buildSubscription(
  overrides: Partial<Subscription> = {},
): Subscription {
  return {
    id: "streamer-1",
    notification_message: "{streamer} is live!",
    ...overrides,
  };
}
