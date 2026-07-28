import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const AuthUserRecordSchema = z.object({
  username: z.string().min(1).max(100),

  discriminator: z.string().max(16),

  avatar: z.string().max(256).default(""),

  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),

  fetchTime: z.number().int().nonnegative(),
});

export type AuthUserRecord = z.infer<typeof AuthUserRecordSchema>;

// A permissive counterpart used to validate partial (merge) writes: every
// field is optional since an update may only touch some of them, but any
// field that IS present must still satisfy the same constraints as a full
// record. This prevents a malformed partial write from silently persisting
// invalid data that only fails validation later, on read.
export const AuthUserUpdateSchema = z.object({
  username: z.string().min(1).max(100).optional(),
  discriminator: z.string().max(16).optional(),
  avatar: z.string().max(256).optional(),
  accessToken: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
  fetchTime: z.number().int().nonnegative().optional(),
});
