import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const PushSubscriptionSchema = z.object({
  id: z.string().min(1),

  subscription: z.object({
    // A real push-service endpoint (FCM/Mozilla/Apple) is well under 300
    // characters in practice; 1000 leaves generous headroom while still
    // guaranteeing the base64url-encoded document id
    // (FirestorePushSubscriptionRepository#getPushSubscriptionId) stays
    // under Firestore's 1500-byte document-id ceiling - the previous 2048
    // limit could produce an id over that ceiling, failing the write with a
    // raw Firestore error instead of a clean validation rejection.
    endpoint: z.string().url().max(1000),

    keys: z.object({
      p256dh: z.string().min(1).max(512),

      auth: z.string().min(1).max(256),
    }),
  }),

  userAgent: z.string().max(512).optional(),
});
