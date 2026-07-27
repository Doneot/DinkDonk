import { describe, expect, it } from "vitest";

import { FirestoreAuthUserRepository } from "../../../modules/auth/infrastructure/firestore/FirestoreAuthUserRepository.js";

import { FakeFirestore } from "../../helpers/fakeFirestore.js";

const RECORD = {
  username: "tester",
  discriminator: "0001",
  avatar: "avatar.png",
  accessToken: "access-token",
  refreshToken: "refresh-token",
  fetchTime: 1_700_000_000_000,
};

function setup() {
  const firestore = new FakeFirestore();

  return {
    firestore,
    repository: new FirestoreAuthUserRepository(firestore.asFirestore()),
  };
}

describe("FirestoreAuthUserRepository", () => {
  describe("checkConnection", () => {
    it("resolves when the collection is reachable", async () => {
      const { repository } = setup();

      await expect(repository.checkConnection()).resolves.toBeUndefined();
    });
  });

  describe("getAuthUser", () => {
    it("returns null for a document that does not exist", async () => {
      const { repository } = setup();

      await expect(repository.getAuthUser("user-1")).resolves.toBeNull();
    });

    it("maps a stored record onto the domain auth user", async () => {
      const { firestore, repository } = setup();

      firestore.write("auth/user-1", RECORD);

      await expect(repository.getAuthUser("user-1")).resolves.toEqual({
        id: "user-1",
        ...RECORD,
      });
    });

    it("defaults a missing avatar to an empty string", async () => {
      const { firestore, repository } = setup();

      const { avatar: _avatar, ...withoutAvatar } = RECORD;

      firestore.write("auth/user-1", withoutAvatar);

      await expect(repository.getAuthUser("user-1")).resolves.toMatchObject({
        avatar: "",
      });
    });

    it.each([
      ["a missing username", { username: undefined }],
      ["a blank access token", { accessToken: "" }],
      ["a negative fetch time", { fetchTime: -1 }],
    ])("rejects a record with %s", async (_label, patch) => {
      const { firestore, repository } = setup();

      firestore.write("auth/user-1", { ...RECORD, ...patch });

      await expect(repository.getAuthUser("user-1")).rejects.toThrow();
    });
  });

  describe("updateAuthUser", () => {
    it("merges rotated credentials into the existing document", async () => {
      const { firestore, repository } = setup();

      firestore.write("auth/user-1", RECORD);

      await repository.updateAuthUser("user-1", {
        accessToken: "rotated",
        fetchTime: 1_700_000_000_001,
      });

      expect(firestore.read("auth/user-1")).toEqual({
        ...RECORD,
        accessToken: "rotated",
        fetchTime: 1_700_000_000_001,
      });
    });

    it("creates the document when it does not exist yet", async () => {
      const { firestore, repository } = setup();

      await repository.updateAuthUser("user-1", { username: "tester" });

      expect(firestore.read("auth/user-1")).toEqual({ username: "tester" });
    });

    it.each(["", "   "])("rejects the blank user id %j", async (userId) => {
      const { repository } = setup();

      await expect(
        repository.updateAuthUser(userId, { username: "tester" }),
      ).rejects.toThrow("Invalid user id");
    });
  });
});
