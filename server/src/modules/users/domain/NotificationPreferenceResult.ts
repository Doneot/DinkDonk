export type UpdateNotificationPreferenceResult =
  | { success: true }
  | { success: false; reason: "invalid_input" | "user_not_found" };
