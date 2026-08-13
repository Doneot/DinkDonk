import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

// A well-formed-but-empty picture/avatar URL (Google's photos[0]/Twitch's
// profile_image_url can legitimately be absent, in which case the callers in
// passport.ts fall back to "") needs to stay valid alongside real URLs, so
// these fields accept either rather than a bare `.url()`, which would reject
// the empty-string default.
const optionalUrl = z.union([z.literal(""), z.string().url()]);

export const DiscordCredentialSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1).max(100),
  discriminator: z.string().min(1).max(16),
  // Not a URL: this is Discord's raw avatar hash (e.g. "a1b2c3..."), which
  // toSessionUser in passport.ts turns into a full CDN URL - the hash itself
  // has no fixed shape to validate against beyond a length bound.
  avatar: z.string().max(256).default(""),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  fetchTime: z.number().int().nonnegative(),
});

export const GoogleCredentialSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  picture: optionalUrl.default(""),
});

export const TwitchCredentialSchema = z.object({
  id: z.string().min(1),
  login: z.string().min(1),
  displayName: z.string().min(1),
  profileImageUrl: optionalUrl.default(""),
});

export const IdentityRecordSchema = z.object({
  email: z.string().email().nullable().default(null),
  emailVerified: z.boolean().default(false),
  discord: DiscordCredentialSchema.optional(),
  google: GoogleCredentialSchema.optional(),
  twitch: TwitchCredentialSchema.optional(),
});

export type IdentityRecord = z.infer<typeof IdentityRecordSchema>;
