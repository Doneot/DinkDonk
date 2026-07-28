import type { Subscription } from "../domain/Subscription.js";
import type {
  SubscribeResult,
  UnsubscribeResult,
  UpdateSubscriptionResult,
} from "../types/SubscribeResult.js";
import type { DomainEventBus } from "../../../shared/events/DomainEventBus.js";

export interface SubscriptionRepository {
  /** Emits "streamerAdded"/"streamerEmpty" as subscriptions change. */
  readonly events: DomainEventBus;

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
