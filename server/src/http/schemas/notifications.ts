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
