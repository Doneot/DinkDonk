export type SavePushSubscribeResult =
  | { success: true; id: string }
  | {
      success: false;
      reason: "invalid_push_subscription";
    };

export type DeletePushSubscribeResult =
  | { success: true; id?: string }
  | {
      success: false;
      reason: "invalid_user" | "invalid_push_subscription";
    };
