export type SavePushSubscribeResult =
  | { success: true; id: string }
  | {
      success: false;
      reason: "invalid_push_subscription" | "push_subscription_limit_reached";
    };

export type DeletePushSubscribeResult =
  | { success: true; id?: string }
  | {
      success: false;
      reason: "invalid_user" | "invalid_push_subscription";
    };
