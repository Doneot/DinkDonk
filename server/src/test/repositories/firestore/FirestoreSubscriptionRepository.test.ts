import { describe, expect, it, vi } from "vitest";

import { FirestoreSubscriptionRepository } from "../../../modules/subscriptions/infrastructure/firestore/FirestoreSubscriptionRepository.js";

import { FakeFirestore } from "../../helpers/fakeFirestore.js";

const BLANK_IDS = ["", "   "] as const;

function setup() {
  const firestore = new FakeFirestore();

  return {
    firestore,
    repository: new FirestoreSubscriptionRepository(firestore.asFirestore()),
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
  firestore.write(`streamers/${streamerId}`, { id: streamerId, users });
}

describe("FirestoreSubscriptionRepository", () => {
  describe("subscribe", () => {
    it("creates the user subscription and the streamer document", async () => {
      const { firestore, repository } = setup();

      const listener = vi.fn();

      repository.on("streamerAdded", listener);

      await expect(
        repository.subscribe("user-1", "streamer-1", "hello"),
      ).resolves.toEqual({ success: true, createdStreamer: true });

      expect(firestore.read("users/user-1")).toMatchObject({
        subscriptions: [{ id: "streamer-1", notification_message: "hello" }],
      });
      expect(firestore.read("streamers/streamer-1")).toEqual({
        id: "streamer-1",
        users: ["user-1"],
      });
      expect(listener.mock.calls).toEqual([["streamer-1"]]);
    });

    it("defaults the notification message to an empty string", async () => {
      const { firestore, repository } = setup();

      await repository.subscribe("user-1", "streamer-1");

      expect(firestore.read("users/user-1")).toMatchObject({
        subscriptions: [{ id: "streamer-1", notification_message: "" }],
      });
    });

    it("reports an existing streamer as not newly created", async () => {
      const { firestore, repository } = setup();

      firestore.write("streamers/streamer-1", {
        id: "streamer-1",
        users: ["user-2"],
      });

      await expect(
        repository.subscribe("user-1", "streamer-1"),
      ).resolves.toEqual({ success: true, createdStreamer: false });

      expect(firestore.read("streamers/streamer-1")).toMatchObject({
        users: ["user-2", "user-1"],
      });
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

    it("does not duplicate the user on the streamer document", async () => {
      const { firestore, repository } = setup();

      firestore.write("users/user-1", { subscriptions: [] });
      firestore.write("streamers/streamer-1", {
        id: "streamer-1",
        users: ["user-1"],
      });

      await repository.subscribe("user-1", "streamer-1");

      expect(firestore.read("streamers/streamer-1")).toMatchObject({
        users: ["user-1"],
      });
    });

    it("rejects a repeat subscription without announcing a streamer", async () => {
      const { firestore, repository } = setup();

      const listener = vi.fn();

      repository.on("streamerAdded", listener);
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

    it("treats a malformed subscriptions field as empty", async () => {
      const { firestore, repository } = setup();

      firestore.write("users/user-1", { subscriptions: "not-an-array" });

      await expect(
        repository.subscribe("user-1", "streamer-1"),
      ).resolves.toMatchObject({ success: true });
    });
  });

  describe("unsubscribe", () => {
    it("removes the subscription and announces an empty streamer", async () => {
      const { firestore, repository } = setup();

      const listener = vi.fn();

      repository.on("streamerEmpty", listener);
      seedSubscription(firestore);

      await expect(
        repository.unsubscribe("user-1", "streamer-1"),
      ).resolves.toEqual({ success: true, usersLeft: 0 });

      expect(firestore.read("users/user-1")).toMatchObject({
        subscriptions: [],
      });
      expect(firestore.read("streamers/streamer-1")).toMatchObject({
        users: [],
      });
      expect(listener.mock.calls).toEqual([["streamer-1"]]);
    });

    it("keeps the streamer when other users remain subscribed", async () => {
      const { firestore, repository } = setup();

      const listener = vi.fn();

      repository.on("streamerEmpty", listener);
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
});
