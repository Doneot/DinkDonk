import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const eventSubHeadersSchema = z.object({
  "twitch-eventsub-message-id": z.string(),
  "twitch-eventsub-message-timestamp": z.string(),
  "twitch-eventsub-message-signature": z.string(),
  "twitch-eventsub-message-type": z.enum([
    "notification",
    "webhook_callback_verification",
    "revocation",
  ]),
});

export const eventSubSubscriptionSchema = z.object({
  id: z.string().optional(),
  status: z.string().optional(),
  type: z.string(),
  version: z.string().optional(),
  condition: z.record(z.string(), z.string()).optional(),
  transport: z
    .object({
      method: z.string(),
      callback: z.string().optional(),
    })
    .passthrough()
    .optional(),
  created_at: z.string().optional(),
  cost: z.number().optional(),
});

export const eventSubEnvelopeSchema = z.object({
  subscription: eventSubSubscriptionSchema,

  // Present for "notification" messages, absent for "webhook_callback_verification"
  // and "revocation" messages. z.unknown() alone requires the key to exist in Zod 4.
  event: z.unknown().optional(),

  challenge: z.string().optional(),
});

export const streamOnlineEventSchema = z.object({
  broadcaster_user_id: z.string(),

  broadcaster_user_login: z.string(),

  broadcaster_user_name: z.string(),

  id: z.string().optional(),

  type: z.string(),

  started_at: z.string(),
});

export type EventSubEnvelope = z.infer<typeof eventSubEnvelopeSchema>;

export type StreamOnlineEvent = z.infer<typeof streamOnlineEventSchema>;
