import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const statusResponseSchema = z.object({
  online: z.boolean(),
});

export const publicKeyResponseSchema = z.object({
  publicKey: z.string(),
});

export const notificationChannelsResponseSchema = z.object({
  discord: z.object({
    enabled: z.boolean(),
  }),
  webPush: z.object({
    enabled: z.boolean(),
    subscriptions: z.number().int().nonnegative(),
  }),
});

export const userCountResponseSchema = z.object({
  count: z.number().int().nonnegative(),
});

export const canReceiveDmResponseSchema = z.object({
  canReceiveDM: z.boolean(),
});

export const streamerSummaryResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatar: z.string().optional(),
});

export const subscriptionResponseSchema = z.object({
  id: z.string().min(1),
  notification_message: z.string().optional(),
});

export const savePushResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    id: z.string().min(1),
  }),
  z.object({
    success: z.literal(false),
    reason: z.literal("invalid_push_subscription"),
  }),
]);

export const deletePushResponseSchema = z.union([
  z.object({
    success: z.literal(true),
  }),
  z.object({
    success: z.literal(false),
    reason: z.enum(["invalid_user", "invalid_push_subscription"]),
  }),
]);

export const subscribeResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    createdStreamer: z.boolean(),
  }),
  z.object({
    success: z.literal(false),
    reason: z.enum(["invalid_input", "already_subscribed"]),
  }),
]);

export const unsubscribeResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    usersLeft: z.number().int().nonnegative(),
  }),
  z.object({
    success: z.literal(false),
    reason: z.enum(["invalid_input", "user_not_found", "not_subscribed"]),
  }),
]);

export const updateSubscriptionResponseSchema = z.union([
  z.object({
    success: z.literal(true),
  }),
  z.object({
    success: z.literal(false),
    reason: z.enum(["user_not_found", "subscription_not_found"]),
  }),
]);

const providerSchema = z.enum(["discord", "google", "twitch"]);

export const userResponseSchema = z.object({
  id: z.string().min(1),
  email: z.string().nullable().optional(),
  emailVerified: z.boolean().optional(),
  name: z.string().optional(),
  avatarUrl: z.string().nullable().optional(),
  providers: z.array(providerSchema).optional(),
  canReceiveDM: z.boolean().optional(),
  subscriptions: z.array(subscriptionResponseSchema).optional(),
});

export const authProvidersResponseSchema = z.object({
  providers: z.array(providerSchema),
});

export type StatusResponse = z.infer<typeof statusResponseSchema>;
export type PublicKeyResponse = z.infer<typeof publicKeyResponseSchema>;
export type NotificationChannelsResponse = z.infer<
  typeof notificationChannelsResponseSchema
>;
export type UserCountResponse = z.infer<typeof userCountResponseSchema>;
export type CanReceiveDmResponse = z.infer<typeof canReceiveDmResponseSchema>;
export type StreamerSummaryResponse = z.infer<
  typeof streamerSummaryResponseSchema
>;
export type UserResponse = z.infer<typeof userResponseSchema>;
export type AuthProvidersResponse = z.infer<typeof authProvidersResponseSchema>;
