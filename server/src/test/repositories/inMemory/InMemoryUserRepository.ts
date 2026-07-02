import type { UserRepository } from "../../../modules/users/ports/UserRepository.js";
import type { User } from "../../../modules/users/domain/User.js";
import type { UserUpdate } from "../../../modules/users/domain/UserUpdate.js";

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  async getUser(userId: string): Promise<User | null> {
    return await Promise.resolve(this.users.get(userId) ?? null);
  }

  async getUsers(): Promise<User[]> {
    return await Promise.resolve([...this.users.values()]);
  }

  async updateUser(userId: string, data: UserUpdate): Promise<void> {
    const existing = this.users.get(userId);

    if (!existing) {
      const created: User = {
        id: userId,
        canReceiveDM: data.canReceiveDM ?? false,
        subscriptions: data.subscriptions ?? [],
      };

      this.users.set(userId, created);
      return await Promise.resolve();
    }

    await Promise.resolve(
      this.users.set(userId, {
        ...existing,
        ...data,
      }),
    );
  }

  // ---------- test helpers ----------

  seed(user: User): void {
    this.users.set(user.id, user);
  }

  clear(): void {
    this.users.clear();
  }
}
