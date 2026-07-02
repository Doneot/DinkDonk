import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const SubscriptionSchema = z.object({
  id: z.string().min(1).max(64),
  notification_message: z.string().max(500).default(""),
});
