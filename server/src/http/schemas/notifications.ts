import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

import { PushSubscriptionSchema } from "../../modules/notifications/schemas/PushSubscriptionSchema.js";

extendZodWithOpenApi(z);

export const pushSubscriptionSchema = PushSubscriptionSchema.shape.subscription;

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
const ALLOWED_PUSH_ENDPOINT_HOSTS = new Set([
  "fcm.googleapis.com", // Chrome, Edge, Opera, Samsung Internet, and other Chromium-based browsers
  "updates.push.services.mozilla.com", // Firefox
  "web.push.apple.com", // Safari (macOS/iOS)
]);

function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    return ALLOWED_PUSH_ENDPOINT_HOSTS.has(new URL(endpoint).hostname);
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

export const deletePushSubscriptionSchema = z.union([
  z.object({
    subscriptionId: z.string().trim().min(1),
  }),
  z
    .object({
      subscription: pushSubscriptionSchema,
    })
    .transform(({ subscription }) => ({
      subscriptionId: subscription,
    })),
]);

export type DeletePushSubscriptionRequest = z.infer<
  typeof deletePushSubscriptionSchema
>;

// Query-string counterpart for DELETE /notifications/web-push/subscriptions:
// only `endpoint` is needed to resolve the subscription (the same value
// deletePushSubscription() already accepts standalone - see
// FirestorePushSubscriptionRepository#deletePushSubscription, which derives
// the document id from just the endpoint), so there's no need to serialize
// the subscription's `keys` into the query string too. A single object with
// two optional fields (rather than a z.union, as deletePushSubscriptionSchema
// above uses for the body) so this can also be registered as an OpenAPI
// query parameter - zod-to-openapi's `query` field only accepts a plain
// object or a transform pipe, not a union.
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
