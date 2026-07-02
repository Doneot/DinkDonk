import type { Subscription } from "../domain/Subscription.js";
import type {
  SubscribeResult,
  UnsubscribeResult,
  UpdateSubscriptionResult,
} from "../types/SubscribeResult.js";

export interface SubscriptionRepository {
  on(arg0: string, arg1: (streamerId: string) => Promise<void>): unknown;

  getSubscription(
    userId: string,
    streamerId: string,
  ): Promise<Subscription | null>;

  subscribe(
    userId: string,
    streamerId: string,
    notificationMessage?: string | null,
  ): Promise<SubscribeResult>;

  unsubscribe(userId: string, streamerId: string): Promise<UnsubscribeResult>;

  updateSubscription(
    userId: string,
    streamerId: string,
    data: Partial<Subscription>,
  ): Promise<UpdateSubscriptionResult>;
}
