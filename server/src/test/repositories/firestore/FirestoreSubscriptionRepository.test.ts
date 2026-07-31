import { describe, expect, it, vi } from "vitest";

import { FirestoreSubscriptionRepository } from "../../../modules/subscriptions/infrastructure/firestore/FirestoreSubscriptionRepository.js";
import { createDomainEventBus } from "../../../shared/events/DomainEventBus.js";
import { logger } from "../../../shared/logger/logger.js";
import type { Subscription } from "../../../modules/subscriptions/domain/Subscription.js";

import { subscriptionRepositoryBehavior } from "../contracts/SubscriptionRepository.behavior.js";
import {
  FakeFirestore,
  FakeDocumentReference,
} from "../../helpers/fakeFirestore.js";

subscriptionRepositoryBehavior("FirestoreSubscriptionRepository", () => {
  const firestore = new FakeFirestore();
  const repository = new FirestoreSubscriptionRepository(
    firestore.asFirestore(),
    createDomainEventBus(logger),
  );

  return Object.assign(repository, {
    seed(userId: string, subscription: Subscription): void {
      const existing = firestore.read(`users/${userId}`) as
        | { subscriptions?: Subscription[] }
        | undefined;

      // A blank id is the contract's way of seeding "this user exists but
      // isn't meaningfully subscribed to anything" (see
      // SubscriptionRepository.behavior.ts's subscription_not_found case) -
      // writing it literally would violate SubscriptionSchema's id.min(1)
      // once it's read back, which InMemorySubscriptionRepository doesn't
      // validate against but Firestore now does. Ensure the user document
      // exists without adding an invalid entry.
      if (subscription.id.trim() === "") {
        firestore.write(`users/${userId}`, {
          subscriptions: existing?.subscriptions ?? [],
        });

        return;
      }

      firestore.write(`users/${userId}`, {
        subscriptions: [...(existing?.subscriptions ?? []), subscription],
      });

      firestore.write(`streamers/${subscription.id}`, { id: subscription.id });
      firestore.write(
        `streamers/${subscription.id}/subscribers/${userId}`,
        { subscribedAt: Date.now() },
      );
    },

    clear(): void {
      for (const path of [
        ...firestore.paths("users"),
        ...firestore.paths("streamers"),
      ]) {
        firestore.remove(path);
      }
    },
  });
});

const BLANK_IDS = ["", "   "] as const;

function setup() {
  const firestore = new FakeFirestore();

  return {
    firestore,
    repository: new FirestoreSubscriptionRepository(
      firestore.asFirestore(),
      createDomainEventBus(logger),
    ),
  };
}

function seedSubscription(
  firestore: FakeFirestore,
  {
    userId = "user-1",
    streamerId = "streamer-1",
    message = "",
    users = [userId],
  }: {
    userId?: string;
    streamerId?: string;
    message?: string;
    users?: string[];
  } = {},
) {
  firestore.write(`users/${userId}`, {
    canReceiveDM: true,
    subscriptions: [{ id: streamerId, notification_message: message }],
  });
  firestore.write(`streamers/${streamerId}`, { id: streamerId });

  for (const subscriberId of users) {
    firestore.write(`streamers/${streamerId}/subscribers/${subscriberId}`, {
      subscribedAt: 1,
    });
  }
}

function subscriberIds(firestore: FakeFirestore, streamerId: string): string[] {
  return firestore
    .paths(`streamers/${streamerId}/subscribers`)
    .map((path) => path.slice(`streamers/${streamerId}/subscribers/`.length))
    .sort();
}

describe("FirestoreSubscriptionRepository", () => {
  describe("subscribe", () => {
    it("creates the user subscription and the streamer document", async () => {
      const { firestore, repository } = setup();

      const listener = vi.fn();

      repository.events.on("streamerAdded", listener);

      await expect(
        repository.subscribe("user-1", "streamer-1", "hello"),
      ).resolves.toEqual({ success: true, createdStreamer: true });

      expect(firestore.read("users/user-1")).toMatchObject({
        subscriptions: [{ id: "streamer-1", notification_message: "hello" }],
      });
      expect(firestore.read("streamers/streamer-1")).toEqual({
        id: "streamer-1",
      });
      expect(subscriberIds(firestore, "streamer-1")).toEqual(["user-1"]);
      expect(listener.mock.calls).toEqual([
        [{ type: "streamerAdded", streamerId: "streamer-1" }],
      ]);
    });

    it("defaults the notification message to an empty string", async () => {
      const { firestore, repository } = setup();

      await repository.subscribe("user-1", "streamer-1");

      expect(firestore.read("users/user-1")).toMatchObject({
        subscriptions: [{ id: "streamer-1", notification_message: "" }],
      });
    });

    it("reports an existing streamer as not newly created, and does not announce it", async () => {
      const { firestore, repository } = setup();

      const listener = vi.fn();

      repository.events.on("streamerAdded", listener);

      firestore.write("streamers/streamer-1", { id: "streamer-1" });
      firestore.write("streamers/streamer-1/subscribers/user-2", {
        subscribedAt: 1,
      });

      await expect(
        repository.subscribe("user-1", "streamer-1"),
      ).resolves.toEqual({ success: true, createdStreamer: false });

      expect(listener).not.toHaveBeenCalled();

      expect(subscriberIds(firestore, "streamer-1")).toEqual([
        "user-1",
        "user-2",
      ]);
    });

    it("keeps other subscriptions of the user", async () => {
      const { firestore, repository } = setup();

      seedSubscription(firestore, { streamerId: "streamer-2" });

      await repository.subscribe("user-1", "streamer-1");

      expect(firestore.read("users/user-1")).toMatchObject({
        subscriptions: [
          { id: "streamer-2", notification_message: "" },
          { id: "streamer-1", notification_message: "" },
        ],
      });
    });

    it("does not create a duplicate subscriber document", async () => {
      const { firestore, repository } = setup();

      firestore.write("users/user-1", { subscriptions: [] });
      firestore.write("streamers/streamer-1", { id: "streamer-1" });
      firestore.write("streamers/streamer-1/subscribers/user-1", {
        subscribedAt: 1,
      });

      await repository.subscribe("user-1", "streamer-1");

      expect(subscriberIds(firestore, "streamer-1")).toEqual(["user-1"]);
    });

    it("rejects a repeat subscription without announcing a streamer", async () => {
      const { firestore, repository } = setup();

      const listener = vi.fn();

      repository.events.on("streamerAdded", listener);
      seedSubscription(firestore);

      await expect(
        repository.subscribe("user-1", "streamer-1"),
      ).resolves.toEqual({ success: false, reason: "already_subscribed" });

      expect(listener).not.toHaveBeenCalled();
    });

    it.each([
      ["a blank user id", "", "streamer-1"],
      ["a blank streamer id", "user-1", "   "],
    ])("rejects %s", async (_label, userId, streamerId) => {
      const { firestore, repository } = setup();

      await expect(repository.subscribe(userId, streamerId)).resolves.toEqual({
        success: false,
        reason: "invalid_input",
      });

      expect(firestore.paths("users")).toEqual([]);
    });

    it("rejects a malformed subscriptions field instead of silently treating it as empty", async () => {
      const { firestore, repository } = setup();

      firestore.write("users/user-1", { subscriptions: "not-an-array" });

      // Now shares FirestoreUserRepository's validated schema/mapper, so a
      // corrupt record surfaces loudly rather than being coerced away.
      await expect(
        repository.subscribe("user-1", "streamer-1"),
      ).rejects.toThrow();
    });
  });

  describe("unsubscribe", () => {
    it("removes the subscription and announces an empty streamer", async () => {
      const { firestore, repository } = setup();

      const listener = vi.fn();

      repository.events.on("streamerEmpty", listener);
      seedSubscription(firestore);

      await expect(
        repository.unsubscribe("user-1", "streamer-1"),
      ).resolves.toEqual({ success: true, usersLeft: 0 });

      expect(firestore.read("users/user-1")).toMatchObject({
        subscriptions: [],
      });
      expect(subscriberIds(firestore, "streamer-1")).toEqual([]);
      expect(listener.mock.calls).toEqual([
        [{ type: "streamerEmpty", streamerId: "streamer-1" }],
      ]);
    });

    it("keeps the streamer when other users remain subscribed", async () => {
      const { firestore, repository } = setup();

      const listener = vi.fn();

      repository.events.on("streamerEmpty", listener);
      seedSubscription(firestore, { users: ["user-1", "user-2"] });

      await expect(
        repository.unsubscribe("user-1", "streamer-1"),
      ).resolves.toEqual({ success: true, usersLeft: 1 });

      expect(listener).not.toHaveBeenCalled();
    });

    it("returns user_not_found when the user document is missing", async () => {
      const { repository } = setup();

      await expect(
        repository.unsubscribe("user-1", "streamer-1"),
      ).resolves.toEqual({ success: false, reason: "user_not_found" });
    });

    it("tolerates a missing streamer document", async () => {
      const { firestore, repository } = setup();

      firestore.write("users/user-1", {
        subscriptions: [{ id: "streamer-1", notification_message: "" }],
      });

      await expect(
        repository.unsubscribe("user-1", "streamer-1"),
      ).resolves.toEqual({ success: true, usersLeft: 0 });

      expect(firestore.read("streamers/streamer-1")).toBeUndefined();
    });

    it.each([
      ["a blank user id", "", "streamer-1"],
      ["a blank streamer id", "user-1", "   "],
    ])("rejects %s", async (_label, userId, streamerId) => {
      const { repository } = setup();

      await expect(repository.unsubscribe(userId, streamerId)).resolves.toEqual(
        { success: false, reason: "invalid_input" },
      );
    });
  });

  describe("getSubscription", () => {
    it("returns the stored subscription", async () => {
      const { firestore, repository } = setup();

      seedSubscription(firestore, { message: "hello" });

      await expect(
        repository.getSubscription("user-1", "streamer-1"),
      ).resolves.toEqual({ id: "streamer-1", notification_message: "hello" });
    });

    it("returns null when the user has no such subscription", async () => {
      const { firestore, repository } = setup();

      seedSubscription(firestore, { streamerId: "streamer-2" });

      await expect(
        repository.getSubscription("user-1", "streamer-1"),
      ).resolves.toBeNull();
    });

    it("returns null when the user document is missing", async () => {
      const { repository } = setup();

      await expect(
        repository.getSubscription("user-1", "streamer-1"),
      ).resolves.toBeNull();
    });

    it.each(BLANK_IDS)("returns null for the blank id %j", async (blank) => {
      const { repository } = setup();

      await expect(
        repository.getSubscription(blank, "streamer-1"),
      ).resolves.toBeNull();
      await expect(
        repository.getSubscription("user-1", blank),
      ).resolves.toBeNull();
    });
  });

  describe("updateSubscription", () => {
    it("updates only the targeted subscription", async () => {
      const { firestore, repository } = setup();

      firestore.write("users/user-1", {
        subscriptions: [
          { id: "streamer-1", notification_message: "old" },
          { id: "streamer-2", notification_message: "keep" },
        ],
      });

      await expect(
        repository.updateSubscription("user-1", "streamer-1", {
          notification_message: "new",
        }),
      ).resolves.toEqual({ success: true });

      expect(firestore.read("users/user-1")).toMatchObject({
        subscriptions: [
          { id: "streamer-1", notification_message: "new" },
          { id: "streamer-2", notification_message: "keep" },
        ],
      });
    });

    it("returns user_not_found when the user document is missing", async () => {
      const { repository } = setup();

      await expect(
        repository.updateSubscription("user-1", "streamer-1", {}),
      ).resolves.toEqual({ success: false, reason: "user_not_found" });
    });

    it("returns subscription_not_found when the user is not subscribed", async () => {
      const { firestore, repository } = setup();

      seedSubscription(firestore, { streamerId: "streamer-2" });

      await expect(
        repository.updateSubscription("user-1", "streamer-1", {}),
      ).resolves.toEqual({ success: false, reason: "subscription_not_found" });
    });
  });

  // Real Firestore transactions retry automatically when two concurrent
  // transactions touch the same document - but only if every mutation
  // genuinely reads the document *inside* the transaction (tx.get), not
  // before it starts. A read taken before runTransaction() is called would
  // capture stale data no retry can fix, silently reintroducing a
  // lost-update bug under concurrent subscribe/unsubscribe/updateSubscription
  // calls for the same user. FakeFirestore has no real concurrency to test
  // this against directly (see its own doc comment), so this instead proves
  // the structural property that makes Firestore's own retry mechanism able
  // to do its job: the user document read is always the very first thing to
  // happen after runTransaction() is invoked, never before it.
  describe("concurrency safety: reads happen inside the transaction", () => {
    it.each([
      [
        "subscribe",
        (repository: FirestoreSubscriptionRepository) =>
          repository.subscribe("user-1", "streamer-1"),
      ],
      [
        "unsubscribe",
        (repository: FirestoreSubscriptionRepository) =>
          repository.unsubscribe("user-1", "streamer-1"),
      ],
      [
        "updateSubscription",
        (repository: FirestoreSubscriptionRepository) =>
          repository.updateSubscription("user-1", "streamer-1", {}),
      ],
    ])("%s reads the user document via the transaction, not before it", async (
      _name,
      invoke,
    ) => {
      const { firestore, repository } = setup();

      seedSubscription(firestore);

      const runTransaction = vi.spyOn(
        FakeFirestore.prototype,
        "runTransaction",
      );
      const get = vi.spyOn(FakeDocumentReference.prototype, "get");

      await invoke(repository);

      expect(runTransaction).toHaveBeenCalled();
      expect(get).toHaveBeenCalled();

      const runTransactionOrder = runTransaction.mock.invocationCallOrder[0];
      const firstGetOrder = get.mock.invocationCallOrder[0];

      expect(runTransactionOrder).toBeDefined();
      expect(firstGetOrder).toBeDefined();

      // The first document read must happen after runTransaction() was
      // invoked (i.e. from inside its callback) - a read that happened
      // first would mean the code captured data before the transaction
      // boundary, defeating Firestore's automatic conflict retry.
      expect(firstGetOrder).toBeGreaterThan(runTransactionOrder!);
    });
  });
});
