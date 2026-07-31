import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

import { PushSubscriptionSchema } from "../../modules/notifications/schemas/PushSubscriptionSchema.js";

extendZodWithOpenApi(z);

export const pushSubscriptionSchema = PushSubscriptionSchema.shape.subscription;

export const savePushSubscriptionSchema = z.object({
  subscription: pushSubscriptionSchema,
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
export const deletePushSubscriptionQuerySchema = z
  .object({
    subscriptionId: z.string().trim().min(1).optional(),
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
