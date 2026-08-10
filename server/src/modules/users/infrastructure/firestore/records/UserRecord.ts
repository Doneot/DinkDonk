import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

import { SubscriptionSchema } from "../../../schemas/SubscriptionSchema.js";
import { MAX_SUBSCRIPTIONS } from "../../../domain/Subscription.js";

extendZodWithOpenApi(z);

export const UserRecordSchema = z.object({
  subscriptions: z.array(SubscriptionSchema).max(MAX_SUBSCRIPTIONS).default([]),
  canReceiveDM: z.boolean().default(false),
  notificationPreferences: z.record(z.string(), z.boolean()).default({}),
});

export type UserRecord = z.infer<typeof UserRecordSchema>;

// A permissive counterpart used to validate partial (merge) writes: every
// field is optional since an update may only touch some of them, but any
// field that IS present must still satisfy the same constraints as a full
// record.
export const UserUpdateSchema = z.object({
  subscriptions: z.array(SubscriptionSchema).max(MAX_SUBSCRIPTIONS).optional(),
  canReceiveDM: z.boolean().optional(),
  notificationPreferences: z.record(z.string(), z.boolean()).optional(),
});
