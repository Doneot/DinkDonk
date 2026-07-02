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
