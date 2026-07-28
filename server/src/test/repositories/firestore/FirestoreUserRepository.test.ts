import { describe, expect, it } from "vitest";

import { FirestoreUserRepository } from "../../../modules/users/infrastructure/firestore/FirestoreUserRepository.js";

import { FakeFirestore } from "../../helpers/fakeFirestore.js";

function setup() {
  const firestore = new FakeFirestore();

  return {
    firestore,
    repository: new FirestoreUserRepository(firestore.asFirestore()),
  };
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
      });
    });

    it("applies record defaults for partially written documents", async () => {
      const { firestore, repository } = setup();

      firestore.write("users/user-1", {});

      await expect(repository.getUser("user-1")).resolves.toEqual({
        id: "user-1",
        canReceiveDM: false,
        subscriptions: [],
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
        { id: "user-1", canReceiveDM: true, subscriptions: [] },
        { id: "user-2", canReceiveDM: false, subscriptions: [] },
      ]);
    });

    it("ignores documents held in sub-collections", async () => {
      const { firestore, repository } = setup();

      firestore.write("users/user-1", {});
      firestore.write("users/user-1/pushSubscriptions/sub-1", {});

      await expect(repository.getUsers()).resolves.toEqual([
        { id: "user-1", canReceiveDM: false, subscriptions: [] },
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
});
