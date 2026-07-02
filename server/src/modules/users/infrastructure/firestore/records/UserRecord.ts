import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

import { SubscriptionSchema } from "../../../../subscriptions/schemas/SubscriptionSchema.js";

extendZodWithOpenApi(z);

export const UserRecordSchema = z.object({
  subscriptions: z.array(SubscriptionSchema).default([]),
  canReceiveDM: z.boolean().default(false),
});

export type UserRecord = z.infer<typeof UserRecordSchema>;
