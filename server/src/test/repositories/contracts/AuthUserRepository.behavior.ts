import { describe, expect, it } from "vitest";

import type { AuthUserRepository } from "../../../modules/auth/ports/AuthUserRepository.js";
import { buildAuthUser } from "../../builders/auth.js";
import type { SeededRepositoryFactory } from "./SeededRepository.js";
import type { AuthUser } from "../../../modules/auth/domain/AuthUser.js";

export function authUserRepositoryBehavior(
  name: string,
  createRepository: SeededRepositoryFactory<AuthUserRepository, [AuthUser]>,
): void {
  describe(name, () => {
    it("checkConnection succeeds", async () => {
      const repository = createRepository();

      await expect(repository.checkConnection()).resolves.toBeUndefined();
    });

    it("starts empty", async () => {
      const repository = createRepository();

      await expect(repository.getAuthUser("missing")).resolves.toBeNull();
    });

    it("returns a seeded auth user", async () => {
      const repository = createRepository();

      const user = buildAuthUser();

      repository.seed(user);

      await expect(repository.getAuthUser(user.id)).resolves.toEqual(user);
    });

    it("updates an existing auth user", async () => {
      const repository = createRepository();

      const user = buildAuthUser();

      repository.seed(user);

      await repository.updateAuthUser(user.id, {
        username: "new-name",
        avatar: "new-avatar",
      });

      await expect(repository.getAuthUser(user.id)).resolves.toEqual({
        ...user,
        username: "new-name",
        avatar: "new-avatar",
      });
    });

    it("creates an auth user when updating a missing user", async () => {
      const repository = createRepository();

      await repository.updateAuthUser("user-1", {
        username: "tester",
      });

      await expect(repository.getAuthUser("user-1")).resolves.toEqual({
        id: "user-1",
        username: "tester",
        discriminator: "",
        avatar: "",
        accessToken: "",
        refreshToken: "",
        fetchTime: 0,
      });
    });

    it("throws for an invalid user id", async () => {
      const repository = createRepository();

      await expect(repository.updateAuthUser("", {})).rejects.toThrow(
        "Invalid user id",
      );
    });

    it("clear removes every auth user", async () => {
      const repository = createRepository();

      repository.seed(buildAuthUser());

      repository.clear();

      await expect(repository.getAuthUser("user-1")).resolves.toBeNull();
    });
  });
}
