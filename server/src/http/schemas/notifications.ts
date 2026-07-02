import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),

  keys: z.object({
    p256dh: z.string().min(1).max(512),

    auth: z.string().min(1).max(256),
  }),
});

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
