import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const DiscordCredentialSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1).max(100),
  discriminator: z.string().max(16),
  avatar: z.string().max(256).default(""),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  fetchTime: z.number().int().nonnegative(),
});

export const GoogleCredentialSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  name: z.string().min(1),
  picture: z.string().default(""),
});

export const TwitchCredentialSchema = z.object({
  id: z.string().min(1),
  login: z.string().min(1),
  displayName: z.string().min(1),
  profileImageUrl: z.string().default(""),
});

export const IdentityRecordSchema = z.object({
  email: z.string().nullable().default(null),
  emailVerified: z.boolean().default(false),
  discord: DiscordCredentialSchema.optional(),
  google: GoogleCredentialSchema.optional(),
  twitch: TwitchCredentialSchema.optional(),
});

export type IdentityRecord = z.infer<typeof IdentityRecordSchema>;
