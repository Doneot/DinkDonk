import { EventEmitter } from "node:events";

import type { SubscriptionRepository } from "../../../modules/subscriptions/ports/SubscriptionRepository.js";
import type { Subscription } from "../../../modules/subscriptions/domain/Subscription.js";
import type {
  SubscribeResult,
  UnsubscribeResult,
  UpdateSubscriptionResult,
} from "../../../modules/subscriptions/types/SubscribeResult.js";

export class InMemorySubscriptionRepository
  extends EventEmitter
  implements SubscriptionRepository
{
  private readonly userSubs = new Map<string, Map<string, Subscription>>();

  on(
    event: string,
    listener: (streamerId: string) => Promise<void> | void,
  ): this {
    return super.on(event, listener);
  }

  async getSubscription(
    userId: string,
    streamerId: string,
  ): Promise<Subscription | null> {
    return await Promise.resolve(
      this.userSubs.get(userId)?.get(streamerId) ?? null,
    );
  }

  async subscribe(
    userId: string,
    streamerId: string,
    notificationMessage = "",
  ): Promise<SubscribeResult> {
    const userMap = this.ensureUser(userId);

    if (userMap.has(streamerId)) {
      return await Promise.resolve({
        success: false,
        reason: "already_subscribed",
      });
    }

    userMap.set(streamerId, {
      id: streamerId,
      notification_message: notificationMessage,
    });

    this.emit("streamerAdded", streamerId);

    return await Promise.resolve({
      success: true,
      createdStreamer: false,
    });
  }

  async unsubscribe(
    userId: string,
    streamerId: string,
  ): Promise<UnsubscribeResult> {
    const userMap = this.userSubs.get(userId);

    if (!userMap) {
      return await Promise.resolve({
        success: false,
        reason: "user_not_found",
      });
    }

    userMap.delete(streamerId);

    const usersLeft = userMap.size;

    if (usersLeft === 0) {
      this.emit("streamerEmpty", streamerId);
    }

    return await Promise.resolve({
      success: true,
      usersLeft,
    });
  }

  async updateSubscription(
    userId: string,
    streamerId: string,
    data: Partial<Subscription>,
  ): Promise<UpdateSubscriptionResult> {
    const userMap = this.userSubs.get(userId);

    if (!userMap) {
      return await Promise.resolve({
        success: false,
        reason: "user_not_found",
      });
    }

    const existing = userMap.get(streamerId);

    if (!existing) {
      return await Promise.resolve({
        success: false,
        reason: "subscription_not_found",
      });
    }

    userMap.set(streamerId, {
      ...existing,
      ...data,
    });

    return await Promise.resolve({ success: true });
  }

  private ensureUser(userId: string): Map<string, Subscription> {
    let map = this.userSubs.get(userId);

    if (!map) {
      map = new Map();
      this.userSubs.set(userId, map);
    }

    return map;
  }

  clear(): void {
    this.userSubs.clear();
  }
}
