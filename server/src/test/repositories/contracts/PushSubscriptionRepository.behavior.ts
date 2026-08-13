import { describe, expect, it } from "vitest";

import type { PushSubscription } from "../../../modules/notifications/domain/PushSubscription.js";
import { MAX_PUSH_SUBSCRIPTIONS } from "../../../modules/notifications/domain/PushSubscription.js";
import type { PushSubscriptionRepository } from "../../../modules/notifications/ports/PushSubscriptionRepository.js";
import { buildPushSubscription } from "../../builders/pushSubscription.js";
import type { SeededRepositoryFactory } from "./SeededRepository.js";

export function pushSubscriptionRepositoryBehavior(
  name: string,
  createRepository: SeededRepositoryFactory<
    PushSubscriptionRepository,
    [string, PushSubscription]
  >,
): void {
  describe(name, () => {
    it("starts empty", async () => {
      const repository = createRepository();

      await expect(repository.getPushSubscriptions("user-1")).resolves.toEqual(
        [],
      );
    });

    it("saves a push subscription", async () => {
      const repository = createRepository();

      const subscription = buildPushSubscription().subscription;

      const result = await repository.savePushSubscription(
        "user-1",
        subscription,
      );

      expect(result).toMatchObject({
        success: true,
      });

      const subscriptions = await repository.getPushSubscriptions("user-1");

      expect(subscriptions).toHaveLength(1);

      expect(subscriptions[0]).toMatchObject({
        subscription,
      });
    });

    it("stores the user agent", async () => {
      const repository = createRepository();

      const subscription = buildPushSubscription().subscription;

      await repository.savePushSubscription("user-1", subscription, {
        userAgent: "Chrome",
      });

      const subscriptions = await repository.getPushSubscriptions("user-1");

      expect(subscriptions[0]?.userAgent).toBe("Chrome");
    });

    it("overwrites an existing subscription with the same endpoint", async () => {
      const repository = createRepository();

      const subscription = buildPushSubscription().subscription;

      await repository.savePushSubscription("user-1", subscription);

      await repository.savePushSubscription("user-1", subscription, {
        userAgent: "Firefox",
      });

      const subscriptions = await repository.getPushSubscriptions("user-1");

      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0]?.userAgent).toBe("Firefox");
    });

    it("rejects an invalid subscription", async () => {
      const repository = createRepository();

      await expect(
        repository.savePushSubscription(
          "user-1",
          buildPushSubscription({
            subscription: {
              endpoint: "",
              keys: {
                p256dh: "",
                auth: "",
              },
            },
          }).subscription,
        ),
      ).resolves.toEqual({
        success: false,
        reason: "invalid_push_subscription",
      });
    });

    it("rejects saving once the push subscription limit is reached", async () => {
      const repository = createRepository();

      for (let i = 0; i < MAX_PUSH_SUBSCRIPTIONS; i += 1) {
        await repository.savePushSubscription("user-1", {
          endpoint: `https://example.com/push/${i}`,
          keys: { p256dh: "test-p256dh-key", auth: "test-auth-key" },
        });
      }

      await expect(
        repository.savePushSubscription("user-1", {
          endpoint: "https://example.com/push/one-too-many",
          keys: { p256dh: "test-p256dh-key", auth: "test-auth-key" },
        }),
      ).resolves.toEqual({
        success: false,
        reason: "push_subscription_limit_reached",
      });
    });

    it("allows re-saving an existing subscription once the limit is reached", async () => {
      const repository = createRepository();
      const subscription = buildPushSubscription().subscription;

      await repository.savePushSubscription("user-1", subscription);

      for (let i = 1; i < MAX_PUSH_SUBSCRIPTIONS; i += 1) {
        await repository.savePushSubscription("user-1", {
          endpoint: `https://example.com/push/${i}`,
          keys: subscription.keys,
        });
      }

      await expect(
        repository.savePushSubscription("user-1", subscription, {
          userAgent: "Updated",
        }),
      ).resolves.toMatchObject({ success: true });
    });

    it("deletes by id", async () => {
      const repository = createRepository();

      const result = await repository.savePushSubscription(
        "user-1",
        buildPushSubscription().subscription,
      );

      if (!result.success) {
        throw new Error("Expected success");
      }

      await expect(
        repository.deletePushSubscription("user-1", result.id),
      ).resolves.toEqual({
        success: true,
      });

      await expect(repository.getPushSubscriptions("user-1")).resolves.toEqual(
        [],
      );
    });

    it("deletes by endpoint", async () => {
      const repository = createRepository();

      const subscription = buildPushSubscription().subscription;

      await repository.savePushSubscription("user-1", subscription);

      await expect(
        repository.deletePushSubscription("user-1", subscription),
      ).resolves.toEqual({
        success: true,
      });

      await expect(repository.getPushSubscriptions("user-1")).resolves.toEqual(
        [],
      );
    });

    it("returns invalid_user for an empty user id", async () => {
      const repository = createRepository();

      await expect(
        repository.deletePushSubscription("", "subscription-id"),
      ).resolves.toEqual({
        success: false,
        reason: "invalid_user",
      });
    });

    it("returns invalid_push_subscription when deleting an invalid id", async () => {
      const repository = createRepository();

      await expect(
        repository.deletePushSubscription("user-1", ""),
      ).resolves.toEqual({
        success: false,
        reason: "invalid_push_subscription",
      });
    });

    it("markPushSubscriptionSeen is a no-op", async () => {
      const repository = createRepository();

      await expect(
        repository.markPushSubscriptionSeen("user-1", "missing"),
      ).resolves.toBeUndefined();
    });

    it("returns deep copies", async () => {
      const repository = createRepository();

      const subscription = buildPushSubscription().subscription;

      await repository.savePushSubscription("user-1", subscription);

      const first = await repository.getPushSubscriptions("user-1");

      first[0]!.subscription.keys.auth = "modified";

      const second = await repository.getPushSubscriptions("user-1");

      expect(second[0]?.subscription.keys.auth).toBe(subscription.keys.auth);
    });

    it("clear removes every subscription", async () => {
      const repository = createRepository();

      await repository.savePushSubscription(
        "user-1",
        buildPushSubscription().subscription,
      );

      repository.clear();

      await expect(repository.getPushSubscriptions("user-1")).resolves.toEqual(
        [],
      );
    });
  });
}
