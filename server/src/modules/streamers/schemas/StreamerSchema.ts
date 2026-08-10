import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const StreamerSchema = z.object({
  id: z.string().min(1).max(64),
  isLive: z.boolean().default(false),
  liveSince: z.string().nullable().default(null),
});
