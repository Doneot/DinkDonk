import type { UserRepository } from "../../../modules/users/ports/UserRepository.js";
import type { User } from "../../../modules/users/domain/User.js";
import type { UserUpdate } from "../../../modules/users/domain/UserUpdate.js";

import { isNonEmptyString } from "../../../shared/utils/validators.js";

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  async getUser(userId: string): Promise<User | null> {
    return structuredClone(this.users.get(userId) ?? null);
  }

  async getUsers(): Promise<User[]> {
    return [...this.users.values()].map((user) => structuredClone(user));
  }

  async updateUser(userId: string, data: UserUpdate): Promise<void> {
    if (!isNonEmptyString(userId)) {
      throw new Error("Invalid user id");
    }

    let existing = this.users.get(userId);

    if (!existing) {
      existing = {
        id: userId,
        subscriptions: [],
        canReceiveDM: false,
      };
    }

    this.users.set(userId, { ...existing, ...data });
  }

  seed(user: User): void {
    this.users.set(user.id, structuredClone(user));
  }

  clear(): void {
    this.users.clear();
  }
}
