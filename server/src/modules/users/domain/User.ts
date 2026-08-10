import type { Subscription } from "./Subscription.js";

export interface User {
  canReceiveDM?: boolean;

  id: string;

  subscriptions: Subscription[];

  /**
   * Per-channel opt-out, keyed by NotificationChannel.name ("discord",
   * "webPush", ...). Absent or missing key means enabled - this is an
   * opt-out model so every existing user keeps today's behavior (notified on
   * every channel they're capable of) without a migration.
   */
  notificationPreferences?: Record<string, boolean>;
}
