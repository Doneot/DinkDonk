import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

import { PushSubscriptionSchema } from "../../modules/notifications/schemas/PushSubscriptionSchema.js";
import { logger } from "../../shared/logger/logger.js";

extendZodWithOpenApi(z);

export const pushSubscriptionSchema = PushSubscriptionSchema.shape.subscription;

// The only channel ids NotificationManager actually knows how to gate on
// today (see NotificationChannel.name on DiscordNotificationChannel /
// WebPushNotificationChannel) - a new channel needs an entry here before a
// user can opt in/out of it.
export const notificationChannelIdSchema = z.enum(["discord", "webPush"]);

export const setChannelPreferenceSchema = z.object({
  channel: notificationChannelIdSchema,
  enabled: z.boolean(),
});

export type SetChannelPreferenceRequest = z.infer<
  typeof setChannelPreferenceSchema
>;

// web-push's sendNotification() (see WebPushNotificationChannel.send) makes
// an outbound HTTPS request to whatever `endpoint` a saved subscription
// carries, entirely server-side. Without restricting that host at save time,
// any authenticated user could register an arbitrary endpoint - a cloud
// metadata address, an internal-network host, anything - and have the
// backend make requests to it on their behalf (SSRF) simply by waiting for
// or triggering a notification to themselves; the p256dh/auth keys are
// locally-generatable and don't need to correspond to a real push service
// for web-push's local encryption step to succeed. Deletion (below) doesn't
// reuse this stricter schema, so removing a subscription saved before this
// allowlist existed (or from a push service not yet listed here) still
// works - only creating new SSRF-capable subscriptions is blocked.
//
// Deliberately whole *domain zones* a vendor controls, not exact hostnames:
// an exact-host allowlist turned out to be real whack-a-mole in practice -
// Chromium-based browsers alone have been seen issuing subscriptions from at
// least fcm.googleapis.com, android.googleapis.com (legacy GCM), and
// jmt17.google.com (an entirely different Google-owned zone, confirmed by a
// live rejection, not documentation), and Edge separately from Windows
// Notification Service's many regional subdomains. None of that is
// exhaustively enumerable up front, and every host this list has missed so
// far turned out to be a legitimate push relay under a vendor's own DNS zone
// - which no outside attacker can get a hostname to resolve under, so
// trusting the whole zone doesn't weaken the SSRF guard this exists for.
const ALLOWED_PUSH_ENDPOINT_HOST_SUFFIXES = [
  ".googleapis.com", // Chrome, Opera, Samsung Internet, and other Chromium-based browsers - fcm.googleapis.com, legacy android.googleapis.com/gcm
  ".google.com", // Google also issues push endpoints directly under this separate zone in some regions/channels (e.g. jmt17.google.com)
  ".mozilla.com", // Firefox - updates.push.services.mozilla.com
  ".apple.com", // Safari (macOS/iOS) - web.push.apple.com
  ".notify.windows.com", // Edge's own Windows Notification Service, sharded across many regional subdomains (wns2-par02p.notify.windows.com, ...) rather than one fixed host
];

function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const { hostname } = new URL(endpoint);

    const allowed = ALLOWED_PUSH_ENDPOINT_HOST_SUFFIXES.some((suffix) =>
      hostname.endsWith(suffix),
    );

    // The endpoint's host (never the full URL - it carries a per-subscription
    // token) is the one piece of information needed to know whether a real
    // browser's push service just isn't on the allowlist yet, and there's no
    // other way to learn it than a live rejection like this one. Interpolated
    // directly into the message (not passed as a merging object) so it can't
    // end up on a separate log line that a copy-paste drops.
    if (!allowed) {
      logger.warn(
        `Rejected web push subscription: host "${hostname}" is not in the allowlist`,
      );
    }

    return allowed;
  } catch {
    return false;
  }
}

export const savePushSubscriptionSchema = z.object({
  subscription: pushSubscriptionSchema.extend({
    endpoint: pushSubscriptionSchema.shape.endpoint.refine(
      isAllowedPushEndpoint,
      "Unsupported push endpoint",
    ),
  }),
});

export type SavePushSubscriptionRequest = z.infer<
  typeof savePushSubscriptionSchema
>;

// Query-string counterpart for DELETE /notifications/web-push/subscriptions:
// only `endpoint` is needed to resolve the subscription (the same value
// deletePushSubscription() already accepts standalone - see
// FirestorePushSubscriptionRepository#deletePushSubscription, which derives
// the document id from just the endpoint), so there's no need to serialize
// the subscription's `keys` into the query string too. A single object with
// two optional fields (rather than a body z.union) so this can also be
// registered as an OpenAPI query parameter - zod-to-openapi's `query` field
// only accepts a plain object or a transform pipe, not a union.
// Matches the base64url charset getPushSubscriptionId() actually produces
// (Buffer#toString("base64url")) - restricts subscriptionId to that shape
// rather than an arbitrary string, since it's used as a Firestore document
// id (getPushSubscriptionsRef(userId).doc(id)) and a client-supplied value
// containing "/" would otherwise be interpreted as a path separator.
const pushSubscriptionIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid subscription id");

export const deletePushSubscriptionQuerySchema = z
  .object({
    subscriptionId: pushSubscriptionIdSchema.optional(),
    endpoint: z.string().trim().min(1).optional(),
  })
  .transform((value, ctx) => {
    if (value.subscriptionId) {
      return { subscriptionId: value.subscriptionId };
    }

    if (value.endpoint) {
      return { subscriptionId: { endpoint: value.endpoint } };
    }

    ctx.addIssue({
      code: "custom",
      message: "Either subscriptionId or endpoint is required",
    });

    return z.NEVER;
  });

export type DeletePushSubscriptionQuery = z.infer<
  typeof deletePushSubscriptionQuerySchema
>;
