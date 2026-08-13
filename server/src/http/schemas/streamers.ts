import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

// Restricted to Twitch's actual numeric-user-id charset. A broader
// z.string() previously allowed `/`, which Firestore's Admin SDK interprets
// as a path separator in .doc(id) calls - a crafted id like
// "<realId>/subscribers/<victimUid>" could resolve to another user's real
// subscriber document instead of a new, harmless one.
export const streamerIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{1,64}$/, "Invalid streamer id");

export const searchStreamersQuerySchema = z.object({
  query: z.string().trim().min(1).max(100),
});

export type SearchStreamerRequest = z.infer<typeof searchStreamersQuerySchema>;

export const batchStreamerInfoSchema = z.object({
  ids: z.array(streamerIdSchema).min(1).max(50),
});

export type BatchStreamerInfoRequest = z.infer<typeof batchStreamerInfoSchema>;
