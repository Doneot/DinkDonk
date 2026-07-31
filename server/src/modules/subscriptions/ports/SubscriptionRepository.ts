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

  /**
   * `id` is intentionally excluded from the patch type - it's what
   * identifies which subscription is being updated (and is what the
   * `subscribers` subcollection doc is keyed by), so letting a patch
   * silently overwrite it could desynchronize the two.
   */
  updateSubscription(
    userId: string,
    streamerId: string,
    data: Partial<Omit<Subscription, "id">>,
  ): Promise<UpdateSubscriptionResult>;
}
