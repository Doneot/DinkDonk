import { describe, expect, it } from "vitest";

import type { PushSubscription } from "../../../modules/notifications/domain/PushSubscription.js";
import { FirestorePushSubscriptionRepository } from "../../../modules/notifications/infrastructure/firestore/FirestorePushSubscriptionRepository.js";
import { FakeFirestore } from "../../helpers/fakeFirestore.js";
import { anyValue } from "../../helpers/matchers.js";
import { pushSubscriptionRepositoryBehavior } from "../contracts/PushSubscriptionRepository.behavior.js";

pushSubscriptionRepositoryBehavior("FirestorePushSubscriptionRepository", () => {
  const firestore = new FakeFirestore();
  const repository = new FirestorePushSubscriptionRepository(
    firestore.asFirestore(),
  );

  // Subscriptions live in a users/{userId}/pushSubscriptions/{id}
  // subcollection, which firestore.paths() can't list recursively - track
  // every user id this test instance has touched so clear() can sweep each
  // one's subcollection explicitly.
  const touchedUserIds = new Set<string>();

  const originalSave = repository.savePushSubscription.bind(repository);

  repository.savePushSubscription = (userId, ...rest) => {
    touchedUserIds.add(userId);

    return originalSave(userId, ...rest);
  };

  return Object.assign(repository, {
    seed(userId: string, subscription: PushSubscription): void {
      touchedUserIds.add(userId);

      const id = Buffer.from(subscription.subscription.endpoint).toString(
        "base64url",
      );

      firestore.write(`users/${userId}/pushSubscriptions/${id}`, {
        subscription: subscription.subscription,
        userAgent: subscription.userAgent,
      });
    },

    clear(): void {
      for (const userId of touchedUserIds) {
        for (const path of firestore.paths(
          `users/${userId}/pushSubscriptions`,
        )) {
          firestore.remove(path);
        }
      }
    },
  });
});

const SUBSCRIPTION = {
  endpoint: "https://push.example.com/subscription-1",
  keys: { p256dh: "p256dh-key", auth: "auth-key" },
};

const SUBSCRIPTION_ID = Buffer.from(SUBSCRIPTION.endpoint).toString(
  "base64url",
);

const PATH = `users/user-1/pushSubscriptions/${SUBSCRIPTION_ID}`;

function setup() {
  const firestore = new FakeFirestore();

  return {
    firestore,
    repository: new FirestorePushSubscriptionRepository(
      firestore.asFirestore(),
    ),
  };
}

describe("FirestorePushSubscriptionRepository", () => {
  describe("getPushSubscriptions", () => {
    it("returns an empty list for a user with no subscriptions", async () => {
      const { repository } = setup();

      await expect(repository.getPushSubscriptions("user-1")).resolves.toEqual(
        [],
      );
    });

    it("returns every stored subscription with its document id", async () => {
      const { firestore, repository } = setup();

      firestore.write(PATH, {
        subscription: SUBSCRIPTION,
        userAgent: "Vitest",
      });

      await expect(repository.getPushSubscriptions("user-1")).resolves.toEqual([
        {
          id: SUBSCRIPTION_ID,
          subscription: SUBSCRIPTION,
          userAgent: "Vitest",
        },
      ]);
    });

    it.each(["", "   "])(
      "returns an empty list for the blank user id %j",
      async (userId) => {
        const { repository } = setup();

        await expect(repository.getPushSubscriptions(userId)).resolves.toEqual(
          [],
        );
      },
    );
  });

  describe("savePushSubscription", () => {
    it("stores the subscription under its endpoint-derived id", async () => {
      const { firestore, repository } = setup();

      await expect(
        repository.savePushSubscription("user-1", SUBSCRIPTION, {
          userAgent: "Vitest",
        }),
      ).resolves.toEqual({ success: true, id: SUBSCRIPTION_ID });

      expect(firestore.read(PATH)).toMatchObject({
        subscription: SUBSCRIPTION,
        userAgent: "Vitest",
      });
    });

    it("records the write timestamps", async () => {
      const { firestore, repository } = setup();

      await repository.savePushSubscription("user-1", SUBSCRIPTION);

      expect(firestore.read(PATH)).toMatchObject({
        createdAt: anyValue,
        updatedAt: anyValue,
        lastSeenAt: anyValue,
      });
    });

    it("defaults a missing user agent to an empty string", async () => {
      const { firestore, repository } = setup();

      await repository.savePushSubscription("user-1", SUBSCRIPTION);

      expect(firestore.read(PATH)).toMatchObject({ userAgent: "" });
    });

    it("re-saving the same endpoint updates rather than duplicates", async () => {
      const { repository } = setup();

      await repository.savePushSubscription("user-1", SUBSCRIPTION);
      await repository.savePushSubscription("user-1", SUBSCRIPTION, {
        userAgent: "Vitest 2",
      });

      await expect(
        repository.getPushSubscriptions("user-1"),
      ).resolves.toHaveLength(1);
    });

    it.each([
      ["a blank user id", "", SUBSCRIPTION],
      [
        "a subscription without an endpoint",
        "user-1",
        { ...SUBSCRIPTION, endpoint: "" },
      ],
    ])("rejects %s", async (_label, userId, subscription) => {
      const { repository } = setup();

      await expect(
        repository.savePushSubscription(userId, subscription),
      ).resolves.toEqual({
        success: false,
        reason: "invalid_push_subscription",
      });
    });
  });

  describe("markPushSubscriptionSeen", () => {
    it("refreshes the last seen timestamp", async () => {
      const { firestore, repository } = setup();

      firestore.write(PATH, { subscription: SUBSCRIPTION });

      await repository.markPushSubscriptionSeen("user-1", SUBSCRIPTION_ID);

      expect(firestore.read(PATH)).toMatchObject({
        subscription: SUBSCRIPTION,
        lastSeenAt: anyValue,
      });
    });

    it.each([
      ["a blank user id", "", SUBSCRIPTION_ID],
      ["a blank subscription id", "user-1", "  "],
    ])("ignores %s", async (_label, userId, subscriptionId) => {
      const { firestore, repository } = setup();

      await repository.markPushSubscriptionSeen(userId, subscriptionId);

      expect(firestore.paths("users/user-1/pushSubscriptions")).toEqual([]);
    });

    it("does not resurrect a subscription that was deleted concurrently, as a corrupt record missing its `subscription` field", async () => {
      // Simulates the send()-in-flight race: getPushSubscriptions() already
      // returned this id, the user deletes it mid-send (e.g. via DELETE
      // /api/notifications/web-push/subscriptions), and only then does this
      // call run. A set(..., {merge:true}) would recreate the doc here with
      // only lastSeenAt - permanently occupying a MAX_PUSH_SUBSCRIPTIONS
      // slot with a record that can never actually send a push.
      const { firestore, repository } = setup();

      await repository.markPushSubscriptionSeen("user-1", SUBSCRIPTION_ID);

      expect(firestore.read(PATH)).toBeUndefined();
    });
  });

  describe("deletePushSubscription", () => {
    it("deletes a subscription referenced by id", async () => {
      const { firestore, repository } = setup();

      firestore.write(PATH, { subscription: SUBSCRIPTION });

      await expect(
        repository.deletePushSubscription("user-1", SUBSCRIPTION_ID),
      ).resolves.toEqual({ success: true });

      expect(firestore.read(PATH)).toBeUndefined();
    });

    it("deletes a subscription referenced by its endpoint", async () => {
      const { firestore, repository } = setup();

      firestore.write(PATH, { subscription: SUBSCRIPTION });

      await expect(
        repository.deletePushSubscription("user-1", {
          endpoint: SUBSCRIPTION.endpoint,
        }),
      ).resolves.toEqual({ success: true });

      expect(firestore.read(PATH)).toBeUndefined();
    });

    it("succeeds for a subscription that was never stored", async () => {
      const { repository } = setup();

      await expect(
        repository.deletePushSubscription("user-1", SUBSCRIPTION_ID),
      ).resolves.toEqual({ success: true });
    });

    it.each(["", "   "])("rejects the blank user id %j", async (userId) => {
      const { repository } = setup();

      await expect(
        repository.deletePushSubscription(userId, SUBSCRIPTION_ID),
      ).resolves.toEqual({ success: false, reason: "invalid_user" });
    });

    it("rejects a blank subscription id", async () => {
      const { repository } = setup();

      await expect(
        repository.deletePushSubscription("user-1", "   "),
      ).resolves.toEqual({
        success: false,
        reason: "invalid_push_subscription",
      });
    });
  });
});
