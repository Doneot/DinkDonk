import type { PushSubscription } from "../domain/PushSubscription.js";
import type {
  SavePushSubscribeResult,
  DeletePushSubscribeResult,
} from "../types/PushSubscribeResult.js";

export interface PushSubscriptionRepository {
  getPushSubscriptions(userId: string): Promise<PushSubscription[]>;

  savePushSubscription(
    userId: string,
    subscription: { endpoint: string },
    metadata?: {
      userAgent?: string;
    },
  ): Promise<SavePushSubscribeResult>;

  markPushSubscriptionSeen(
    userId: string,
    subscriptionId: string,
  ): Promise<void>;

  deletePushSubscription(
    userId: string,
    subscriptionId: string | { endpoint: string },
  ): Promise<DeletePushSubscribeResult>;
}
