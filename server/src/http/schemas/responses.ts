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

export const savePushResponseSchema = z.object({
  id: z.string().min(1),
});

export const deletePushResponseSchema = z.object({});

export const subscribeResponseSchema = z.object({
  createdStreamer: z.boolean(),
});

export const unsubscribeResponseSchema = z.object({
  usersLeft: z.number().int().nonnegative(),
});

export const updateSubscriptionResponseSchema = z.object({});

export const logoutResponseSchema = z.object({});

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
export type SavePushResponse = z.infer<typeof savePushResponseSchema>;
export type SubscribeResponse = z.infer<typeof subscribeResponseSchema>;
export type UnsubscribeResponse = z.infer<typeof unsubscribeResponseSchema>;
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
