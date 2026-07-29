import type { SubscriptionRepository } from "../../../modules/subscriptions/ports/SubscriptionRepository.js";
import type { Subscription } from "../../../modules/subscriptions/domain/Subscription.js";
import type {
  SubscribeResult,
  UnsubscribeResult,
  UpdateSubscriptionResult,
} from "../../../modules/subscriptions/types/SubscribeResult.js";
import type { DomainEventBus } from "../../../shared/events/DomainEventBus.js";
import { createDomainEventBus } from "../../../shared/events/DomainEventBus.js";
import { logger } from "../../../shared/logger/logger.js";

import { isNonEmptyString } from "../../../shared/utils/validators.js";
import { InMemorySubscriberStore } from "./InMemorySubscriberStore.js";

export class InMemorySubscriptionRepository implements SubscriptionRepository {
  private readonly userSubscriptions = new Map<
    string,
    Map<string, Subscription>
  >();

  constructor(
    readonly events: DomainEventBus = createDomainEventBus(logger),
    private readonly streamerUsers: InMemorySubscriberStore = new InMemorySubscriberStore(),
  ) {}

  getSubscription(
    userId: string,
    streamerId: string,
  ): Promise<Subscription | null> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(streamerId)) {
      return Promise.resolve(null);
    }

    return Promise.resolve(
      this.userSubscriptions.get(userId)?.get(streamerId) ?? null,
    );
  }

  subscribe(
    userId: string,
    streamerId: string,
    notificationMessage = "",
  ): Promise<SubscribeResult> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(streamerId)) {
      return Promise.resolve({
        success: false,
        reason: "invalid_input",
      });
    }

    const subscriptions = this.ensureUser(userId);

    if (subscriptions.has(streamerId)) {
      return Promise.resolve({
        success: false,
        reason: "already_subscribed",
      });
    }

    subscriptions.set(streamerId, {
      id: streamerId,
      notification_message: notificationMessage,
    });

    const createdStreamer = !this.streamerUsers.has(streamerId);

    this.streamerUsers.ensure(streamerId).add(userId);

    if (createdStreamer) {
      this.events.emit({ type: "streamerAdded", streamerId });
    }

    return Promise.resolve({
      success: true,
      createdStreamer,
    });
  }

  unsubscribe(userId: string, streamerId: string): Promise<UnsubscribeResult> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(streamerId)) {
      return Promise.resolve({
        success: false,
        reason: "invalid_input",
      });
    }

    const subscriptions = this.userSubscriptions.get(userId);

    if (!subscriptions) {
      return Promise.resolve({
        success: false,
        reason: "user_not_found",
      });
    }

    subscriptions.delete(streamerId);

    let usersLeft = 0;

    if (this.streamerUsers.has(streamerId)) {
      const users = this.streamerUsers.ensure(streamerId);

      users.delete(userId);
      usersLeft = users.size;

      if (usersLeft === 0) {
        this.streamerUsers.delete(streamerId);
        this.events.emit({ type: "streamerEmpty", streamerId });
      }
    }

    return Promise.resolve({
      success: true,
      usersLeft,
    });
  }

  updateSubscription(
    userId: string,
    streamerId: string,
    data: Partial<Subscription>,
  ): Promise<UpdateSubscriptionResult> {
    const subscriptions = this.userSubscriptions.get(userId);

    if (!subscriptions) {
      return Promise.resolve({
        success: false,
        reason: "user_not_found",
      });
    }

    const existing = subscriptions.get(streamerId);

    if (!existing) {
      return Promise.resolve({
        success: false,
        reason: "subscription_not_found",
      });
    }

    subscriptions.set(streamerId, {
      ...existing,
      ...data,
    });

    return Promise.resolve({
      success: true,
    });
  }

  seed(userId: string, subscription: Subscription): void {
    const subscriptions = this.ensureUser(userId);

    subscriptions.set(subscription.id, subscription);

    this.streamerUsers.ensure(subscription.id).add(userId);
  }

  clear(): void {
    this.userSubscriptions.clear();
    this.streamerUsers.clear();
  }

  private ensureUser(userId: string): Map<string, Subscription> {
    let subscriptions = this.userSubscriptions.get(userId);

    if (!subscriptions) {
      subscriptions = new Map();
      this.userSubscriptions.set(userId, subscriptions);
    }

    return subscriptions;
  }
}
