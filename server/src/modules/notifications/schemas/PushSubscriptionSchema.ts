import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const PushSubscriptionSchema = z.object({
  id: z.string().min(1),

  subscription: z.object({
    endpoint: z.string().url().max(2048),

    keys: z.object({
      p256dh: z.string().min(1).max(512),

      auth: z.string().min(1).max(256),
    }),
  }),

  userAgent: z.string().max(512).optional(),
});
