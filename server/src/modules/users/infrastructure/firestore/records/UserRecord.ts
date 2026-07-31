import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

import { SubscriptionSchema } from "../../../../subscriptions/schemas/SubscriptionSchema.js";

extendZodWithOpenApi(z);

// 200 is a soft product limit, not a hard technical one - it's here so a
// runaway subscriptions array fails predictably with a clear Zod error well
// before it could ever approach Firestore's 1 MiB document-size ceiling
// (which would otherwise fail with an opaque Firestore error).
const MAX_SUBSCRIPTIONS = 200;

export const UserRecordSchema = z.object({
  subscriptions: z.array(SubscriptionSchema).max(MAX_SUBSCRIPTIONS).default([]),
  canReceiveDM: z.boolean().default(false),
});

export type UserRecord = z.infer<typeof UserRecordSchema>;

// A permissive counterpart used to validate partial (merge) writes: every
// field is optional since an update may only touch some of them, but any
// field that IS present must still satisfy the same constraints as a full
// record.
export const UserUpdateSchema = z.object({
  subscriptions: z.array(SubscriptionSchema).max(MAX_SUBSCRIPTIONS).optional(),
  canReceiveDM: z.boolean().optional(),
});
