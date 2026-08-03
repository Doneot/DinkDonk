export interface PushSubscription {
  id: string;

  subscription: {
    endpoint: string;

    keys: {
      p256dh: string;

      auth: string;
    };
  };

  userAgent?: string;
}

// A soft product limit, not a hard technical one - comfortably above any
// realistic number of real devices/browsers one person owns. Without it, a
// user can register an unbounded number of endpoints (each one independently
// restricted to a real push-service host by the SSRF allowlist in
// http/schemas/notifications.ts, but the *count* itself was previously
// unbounded); WebPushNotificationChannel.send fetches and fires
// webpush.sendNotification at every one of a user's subscriptions
// concurrently with no batching, so an unbounded count is both an unbounded
// Firestore storage cost and a self-triggerable outbound-request-fan-out
// vector. Enforced transactionally before the write in
// FirestorePushSubscriptionRepository#savePushSubscription, mirroring
// MAX_SUBSCRIPTIONS's write-side enforcement in
// modules/users/domain/Subscription.ts.
export const MAX_PUSH_SUBSCRIPTIONS = 20;
