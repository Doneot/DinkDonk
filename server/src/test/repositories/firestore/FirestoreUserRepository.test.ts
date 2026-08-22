import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import type { User } from "../../../modules/users/domain/User.js";
import { FirestoreUserRepository } from "../../../modules/users/infrastructure/firestore/FirestoreUserRepository.js";
import { createDomainEventBus } from "../../../shared/events/DomainEventBus.js";
import { logger } from "../../../shared/logger/logger.js";
import {
  FakeFirestore,
  FakeDocumentReference,
} from "../../helpers/fakeFirestore.js";
import { userRepositoryBehavior } from "../contracts/UserRepository.behavior.js";

userRepositoryBehavior("FirestoreUserRepository", () => {
  const firestore = new FakeFirestore();
  const repository = new FirestoreUserRepository(
    firestore.asFirestore(),
    createDomainEventBus(logger),
  );

  return Object.assign(repository, {
    seed(user: User): void {
      const { id, subscriptions, ...rest } = user;

      firestore.write(`users/${id}`, { ...rest, subscriptions });

      // Mirrors each subscription into the streamers/{id}/subscribers
      // subcollection too, the same way subscribe() atomically writes both
      // - so unsubscribe()'s subscriber-count logic sees a seeded
      // subscription as a real subscriber, not just an entry on the user's
      // own document.
      for (const subscription of subscriptions) {
        firestore.write(`streamers/${subscription.id}`, {
          id: subscription.id,
        });
        firestore.write(`streamers/${subscription.id}/subscribers/${id}`, {
          subscribedAt: Date.now(),
        });
      }
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

function setup() {
  const firestore = new FakeFirestore();

  return {
    firestore,
    repository: new FirestoreUserRepository(
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

describe("FirestoreUserRepository", () => {
  describe("getUser", () => {
    it("returns null for a document that does not exist", async () => {
      const { repository } = setup();

      await expect(repository.getUser("user-1")).resolves.toBeNull();
    });

    it("maps a stored record onto the domain user", async () => {
      const { firestore, repository } = setup();

      firestore.write("users/user-1", {
        canReceiveDM: true,
        subscriptions: [{ id: "streamer-1", notification_message: "hello" }],
      });

      await expect(repository.getUser("user-1")).resolves.toEqual({
        id: "user-1",
        canReceiveDM: true,
        subscriptions: [{ id: "streamer-1", notification_message: "hello" }],
        notificationPreferences: {},
      });
    });

    it("applies record defaults for partially written documents", async () => {
      const { firestore, repository } = setup();

      firestore.write("users/user-1", {});

      await expect(repository.getUser("user-1")).resolves.toEqual({
        id: "user-1",
        canReceiveDM: false,
        subscriptions: [],
        notificationPreferences: {},
      });
    });

    it("defaults a subscription without a message", async () => {
      const { firestore, repository } = setup();

      firestore.write("users/user-1", {
        subscriptions: [{ id: "streamer-1" }],
      });

      await expect(repository.getUser("user-1")).resolves.toMatchObject({
        subscriptions: [{ id: "streamer-1", notification_message: "" }],
      });
    });

    it("rejects a record that violates the schema", async () => {
      const { firestore, repository } = setup();

      firestore.write("users/user-1", { canReceiveDM: "yes" });

      await expect(repository.getUser("user-1")).rejects.toThrow();
    });
  });

  describe("getUsers", () => {
    it("returns an empty list when the collection is empty", async () => {
      const { repository } = setup();

      await expect(repository.getUsers()).resolves.toEqual([]);
    });

    it("maps every document in the collection", async () => {
      const { firestore, repository } = setup();

      firestore.write("users/user-1", { canReceiveDM: true });
      firestore.write("users/user-2", { canReceiveDM: false });

      await expect(repository.getUsers()).resolves.toEqual([
        {
          id: "user-1",
          canReceiveDM: true,
          subscriptions: [],
          notificationPreferences: {},
        },
        {
          id: "user-2",
          canReceiveDM: false,
          subscriptions: [],
          notificationPreferences: {},
        },
      ]);
    });

    it("ignores documents held in sub-collections", async () => {
      const { firestore, repository } = setup();

      firestore.write("users/user-1", {});
      firestore.write("users/user-1/pushSubscriptions/sub-1", {});

      await expect(repository.getUsers()).resolves.toEqual([
        {
          id: "user-1",
          canReceiveDM: false,
          subscriptions: [],
          notificationPreferences: {},
        },
      ]);
    });
  });

  describe("countUsersReceivingDM", () => {
    it("counts only users with canReceiveDM=true", async () => {
      const { firestore, repository } = setup();

      firestore.write("users/user-1", { canReceiveDM: true });
      firestore.write("users/user-2", { canReceiveDM: false });
      firestore.write("users/user-3", { canReceiveDM: true });

      await expect(repository.countUsersReceivingDM()).resolves.toBe(2);
    });

    it("returns zero for an empty collection", async () => {
      const { repository } = setup();

      await expect(repository.countUsersReceivingDM()).resolves.toBe(0);
    });
  });

  describe("updateUser", () => {
    it("merges the update into the existing document", async () => {
      const { firestore, repository } = setup();

      firestore.write("users/user-1", {
        canReceiveDM: false,
        subscriptions: [{ id: "streamer-1", notification_message: "" }],
      });

      await repository.updateUser("user-1", { canReceiveDM: true });

      expect(firestore.read("users/user-1")).toEqual({
        canReceiveDM: true,
        subscriptions: [{ id: "streamer-1", notification_message: "" }],
      });
    });

    it("creates the document when it does not exist yet", async () => {
      const { firestore, repository } = setup();

      await repository.updateUser("user-1", { canReceiveDM: true });

      expect(firestore.read("users/user-1")).toEqual({ canReceiveDM: true });
    });

    it.each(["", "   "])("rejects the blank user id %j", async (userId) => {
      const { repository } = setup();

      await expect(
        repository.updateUser(userId, { canReceiveDM: true }),
      ).rejects.toThrow("Invalid user id");
    });
  });

  // FakeFirestore doesn't model onSnapshot's real-time change-stream
  // semantics, so watchUsers() is exercised against a hand-rolled mock of
  // just that surface instead.
  describe("watchUsers", () => {
    type DocChange = {
      type: "added" | "modified" | "removed";
      doc: { id: string; data: () => Record<string, unknown> };
    };

    function docChange(
      type: DocChange["type"],
      id: string,
      data: Record<string, unknown> = {},
    ): DocChange {
      return { type, doc: { id, data: () => data } };
    }

    function setupWatch() {
      const unsubscribe = vi.fn();
      const listeners: Array<
        (snapshot: { docChanges: () => DocChange[] }) => void
      > = [];
      const errorListeners: Array<(error: Error) => void> = [];

      const collection = vi.fn().mockReturnValue({
        onSnapshot: (
          listener: (snapshot: { docChanges: () => DocChange[] }) => void,
          onError: (error: Error) => void,
        ) => {
          listeners.push(listener);
          errorListeners.push(onError);

          return unsubscribe;
        },
      });

      const repository = new FirestoreUserRepository(
        { collection } as unknown as Firestore,
        createDomainEventBus(logger),
      );

      return {
        unsubscribe,
        repository,
        emit: (...changes: DocChange[]) => {
          for (const listener of listeners) {
            listener({ docChanges: () => changes });
          }
        },
        emitError: (error: Error) => {
          for (const onError of errorListeners) {
            onError(error);
          }
        },
      };
    }

    it("forwards a modified user, mapped through the domain schema", () => {
      const { repository, emit } = setupWatch();
      const onChange = vi.fn();

      repository.watchUsers(onChange, vi.fn());

      emit(
        docChange("modified", "user-1", {
          canReceiveDM: true,
          subscriptions: [{ id: "streamer-1", notification_message: "hi" }],
        }),
      );

      expect(onChange).toHaveBeenCalledWith({
        id: "user-1",
        canReceiveDM: true,
        subscriptions: [{ id: "streamer-1", notification_message: "hi" }],
        notificationPreferences: {},
      } satisfies User);
    });

    it.each(["added", "removed"] as const)(
      "ignores %s documents",
      (type) => {
        const { repository, emit } = setupWatch();
        const onChange = vi.fn();

        repository.watchUsers(onChange, vi.fn());

        emit(docChange(type, "user-1"));

        expect(onChange).not.toHaveBeenCalled();
      },
    );

    it("logs and skips a document that fails schema validation instead of throwing", () => {
      const error = vi.spyOn(logger, "error").mockReturnValue();
      const { repository, emit } = setupWatch();
      const onChange = vi.fn();

      repository.watchUsers(onChange, vi.fn());

      expect(() =>
        emit(docChange("modified", "user-1", { canReceiveDM: "not-a-boolean" })),
      ).not.toThrow();

      expect(onChange).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
    });

    it("forwards a listener-level error to onError", () => {
      const { repository, emitError } = setupWatch();
      const onError = vi.fn();

      repository.watchUsers(vi.fn(), onError);

      const error = new Error("firestore unavailable");

      emitError(error);

      expect(onError).toHaveBeenCalledWith(error);
    });

    it("returns the underlying unsubscribe function", () => {
      const { repository, unsubscribe } = setupWatch();

      const returned = repository.watchUsers(vi.fn(), vi.fn());

      returned();

      expect(unsubscribe).toHaveBeenCalledOnce();
    });
  });

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

    it("reports an existing streamer as not newly created, but still announces it", async () => {
      // The streamer doc's existence isn't a safe proxy for "has an active
      // EventSub subscription" (it persists even after every subscriber
      // leaves), so streamerAdded fires regardless of createdStreamer -
      // handleStreamerAdded's own idempotency check is what actually
      // decides whether a subscription needs (re)creating.
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

      expect(listener).toHaveBeenCalledWith({
        type: "streamerAdded",
        streamerId: "streamer-1",
      });

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

    it.each(["", "   "])("returns null for the blank id %j", async (blank) => {
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
        (repository: FirestoreUserRepository) =>
          repository.subscribe("user-1", "streamer-1"),
      ],
      [
        "unsubscribe",
        (repository: FirestoreUserRepository) =>
          repository.unsubscribe("user-1", "streamer-1"),
      ],
      [
        "updateSubscription",
        (repository: FirestoreUserRepository) =>
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
