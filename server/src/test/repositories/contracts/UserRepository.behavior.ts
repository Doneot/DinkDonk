import { describe, expect, it } from "vitest";

import type { UserRepository } from "../../../modules/users/ports/UserRepository.js";

import { buildUser } from "../../builders/user.js";
import type { SeededRepositoryFactory } from "./SeededRepository.js";
import type { User } from "../../../modules/users/domain/User.js";

export function userRepositoryBehavior(
  name: string,
  createRepository: SeededRepositoryFactory<UserRepository, [User]>,
): void {
  describe(name, () => {
    it("starts empty", async () => {
      const repository = createRepository();

      await expect(repository.getUsers()).resolves.toEqual([]);
      await expect(repository.getUser("missing")).resolves.toBeNull();
    });

    it("returns a seeded user", async () => {
      const repository = createRepository();

      const user = buildUser();

      repository.seed(user);

      await expect(repository.getUser(user.id)).resolves.toEqual(user);
    });

    it("returns all users", async () => {
      const repository = createRepository();

      const user1 = buildUser({
        id: "user-1",
      });

      const user2 = buildUser({
        id: "user-2",
      });

      repository.seed(user1);
      repository.seed(user2);

      await expect(repository.getUsers()).resolves.toEqual([user1, user2]);
    });

    it("updates an existing user", async () => {
      const repository = createRepository();

      const user = buildUser();

      repository.seed(user);

      await repository.updateUser(user.id, {
        canReceiveDM: false,
      });

      await expect(repository.getUser(user.id)).resolves.toEqual({
        ...user,
        canReceiveDM: false,
      });
    });

    it("creates a user when updating a missing one", async () => {
      const repository = createRepository();

      await repository.updateUser("user-1", {
        canReceiveDM: true,
      });

      await expect(repository.getUser("user-1")).resolves.toEqual({
        id: "user-1",
        canReceiveDM: true,
        subscriptions: [],
      });
    });

    it("throws for an invalid user id", async () => {
      const repository = createRepository();

      await expect(repository.updateUser("", {})).rejects.toThrow(
        "Invalid user id",
      );
    });

    it("clear removes every user", async () => {
      const repository = createRepository();

      repository.seed(buildUser());

      repository.clear();

      await expect(repository.getUsers()).resolves.toEqual([]);
    });

    it("counts only users with canReceiveDM=true", async () => {
      const repository = createRepository();

      repository.seed(buildUser({ id: "user-1", canReceiveDM: true }));
      repository.seed(buildUser({ id: "user-2", canReceiveDM: false }));
      repository.seed(buildUser({ id: "user-3", canReceiveDM: true }));

      await expect(repository.countUsersReceivingDM()).resolves.toBe(2);
    });
  });
}
