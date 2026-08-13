import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { streamerIdSchema } from "./streamers.js";

extendZodWithOpenApi(z);

export const subscribeSchema = z.object({
  streamerId: streamerIdSchema,
});

export type SubscribeRequest = z.infer<typeof subscribeSchema>;

export type UnsubscribeRequest = z.infer<typeof subscribeSchema>;

export const setMessageSchema = z.object({
  id: streamerIdSchema,

  message: z.string().trim().max(500).default(""),
});

export type SetMessageRequest = z.infer<typeof setMessageSchema>;
