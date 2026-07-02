import type { PushSubscriptionRepository } from "../../../modules/notifications/ports/PushSubscriptionRepository.js";
import type { PushSubscription } from "../../../modules/notifications/domain/PushSubscription.js";
import type {
  SavePushSubscribeResult,
  DeletePushSubscribeResult,
} from "../../../modules/notifications/types/PushSubscribeResult.js";

export class InMemoryPushSubscriptionRepository implements PushSubscriptionRepository {
  private readonly store = new Map<string, Map<string, PushSubscription>>();

  async getPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    return await Promise.resolve([...(this.store.get(userId)?.values() ?? [])]);
  }

  async savePushSubscription(
    userId: string,
    subscription: { endpoint: string },
    metadata: { userAgent?: string } = {},
  ): Promise<SavePushSubscribeResult> {
    if (!subscription?.endpoint) {
      return await Promise.resolve({
        success: false,
        reason: "invalid_push_subscription",
      });
    }

    const id = this.getId(subscription.endpoint);

    const userMap = this.ensureUser(userId);

    const pushSubscription: PushSubscription = {
      id,
      subscription: {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: "",
          auth: "",
        },
      },
    };

    if (metadata.userAgent !== undefined) {
      pushSubscription.userAgent = metadata.userAgent;
    }

    userMap.set(id, pushSubscription);

    return await Promise.resolve({ success: true, id });
  }

  async markPushSubscriptionSeen(
    userId: string,
    subscriptionId: string,
  ): Promise<void> {
    const sub = this.store.get(userId)?.get(subscriptionId);

    if (!sub) return await Promise.resolve();

    // no-op in memory (you could track lastSeenAt if needed)
  }

  async deletePushSubscription(
    userId: string,
    subscription: string | { endpoint: string },
  ): Promise<DeletePushSubscribeResult> {
    const id =
      typeof subscription === "string"
        ? subscription
        : this.getId(subscription.endpoint);

    const userMap = this.store.get(userId);

    if (!userMap || !userMap.has(id)) {
      return { success: false, reason: "invalid_push_subscription" };
    }

    userMap.delete(id);

    return await Promise.resolve({ success: true, id });
  }

  // ---------- helpers ----------

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

  clear(): void {
    this.store.clear();
  }
}
