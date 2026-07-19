import type { PushSubscriptionRepository } from "../../../modules/notifications/ports/PushSubscriptionRepository.js";
import type { PushSubscription } from "../../../modules/notifications/domain/PushSubscription.js";
import type {
  SavePushSubscribeResult,
  DeletePushSubscribeResult,
} from "../../../modules/notifications/types/PushSubscribeResult.js";

import { isNonEmptyString } from "../../../shared/utils/validators.js";

export class InMemoryPushSubscriptionRepository implements PushSubscriptionRepository {
  private readonly store = new Map<string, Map<string, PushSubscription>>();

  async getPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    if (!isNonEmptyString(userId)) {
      return [];
    }

    return [...(this.store.get(userId)?.values() ?? [])].map((subscription) =>
      structuredClone(subscription),
    );
  }

  async savePushSubscription(
    userId: string,
    subscription: PushSubscription["subscription"],
    metadata: { userAgent?: string } = {},
  ): Promise<SavePushSubscribeResult> {
    if (!isNonEmptyString(userId) || !subscription?.endpoint) {
      return {
        success: false,
        reason: "invalid_push_subscription",
      };
    }

    const id = this.getId(subscription.endpoint);

    const userMap = this.ensureUser(userId);

    const pushSubscription: PushSubscription = {
      id,
      subscription: structuredClone(subscription),
      userAgent: metadata.userAgent ?? "",
    };

    userMap.set(id, pushSubscription);

    return {
      success: true,
      id,
    };
  }

  async markPushSubscriptionSeen(
    userId: string,
    subscriptionId: string,
  ): Promise<void> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(subscriptionId)) {
      return;
    }

    // Firestore only updates lastSeenAt.
    // We intentionally keep this as a no-op.
  }

  async deletePushSubscription(
    userId: string,
    subscription: string | { endpoint: string },
  ): Promise<DeletePushSubscribeResult> {
    if (!isNonEmptyString(userId)) {
      return {
        success: false,
        reason: "invalid_user",
      };
    }

    const id =
      typeof subscription === "string"
        ? subscription
        : this.getId(subscription.endpoint);

    if (!isNonEmptyString(id)) {
      return {
        success: false,
        reason: "invalid_push_subscription",
      };
    }

    this.store.get(userId)?.delete(id);

    return {
      success: true,
    };
  }

  seed(userId: string, subscription: PushSubscription): void {
    this.ensureUser(userId).set(subscription.id, structuredClone(subscription));
  }

  clear(): void {
    this.store.clear();
  }

  private ensureUser(userId: string): Map<string, PushSubscription> {
    let map = this.store.get(userId);

    if (!map) {
      map = new Map();
      this.store.set(userId, map);
    }

    return map;
  }

  private getId(endpoint: string): string {
    return Buffer.from(endpoint).toString("base64url");
  }
}
