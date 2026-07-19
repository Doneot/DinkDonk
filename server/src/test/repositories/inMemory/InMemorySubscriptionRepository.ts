import { EventEmitter } from "node:events";

import type { SubscriptionRepository } from "../../../modules/subscriptions/ports/SubscriptionRepository.js";
import type { Subscription } from "../../../modules/subscriptions/domain/Subscription.js";
import type {
  SubscribeResult,
  UnsubscribeResult,
  UpdateSubscriptionResult,
} from "../../../modules/subscriptions/types/SubscribeResult.js";

import { isNonEmptyString } from "../../../shared/utils/validators.js";

export class InMemorySubscriptionRepository
  extends EventEmitter
  implements SubscriptionRepository
{
  private readonly userSubscriptions = new Map<
    string,
    Map<string, Subscription>
  >();

  private readonly streamerUsers = new Map<string, Set<string>>();

  override on(
    event: string,
    listener: (streamerId: string) => Promise<void> | void,
  ): this {
    return super.on(event, listener);
  }

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

    let users = this.streamerUsers.get(streamerId);

    const createdStreamer = users === undefined;

    if (!users) {
      users = new Set();
      this.streamerUsers.set(streamerId, users);
    }

    users.add(userId);

    if (createdStreamer) {
      this.emit("streamerAdded", streamerId);
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

    const users = this.streamerUsers.get(streamerId);

    if (users) {
      users.delete(userId);

      if (users.size === 0) {
        this.streamerUsers.delete(streamerId);
        this.emit("streamerEmpty", streamerId);
      }
    }

    return Promise.resolve({
      success: true,
      usersLeft: users?.size ?? 0,
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

    let users = this.streamerUsers.get(subscription.id);

    if (!users) {
      users = new Set();
      this.streamerUsers.set(subscription.id, users);
    }

    users.add(userId);
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
