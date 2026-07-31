export type SubscribeResult =
  | { success: true; createdStreamer: boolean }
  | {
      success: false;
      reason: "invalid_input" | "already_subscribed";
    };

export type UnsubscribeResult =
  | { success: true; usersLeft: number }
  | {
      success: false;
      reason: "invalid_input" | "user_not_found" | "not_subscribed";
    };

export type UpdateSubscriptionResult =
  | { success: true }
  | { success: false; reason: "user_not_found" | "subscription_not_found" };
