import type { AuthUserRepository } from "../../../modules/auth/ports/AuthUserRepository.js";
import type { AuthUser } from "../../../modules/auth/domain/AuthUser.js";
import type { AuthUserUpdate } from "../../../modules/auth/domain/AuthUserUpdate.js";

export class InMemoryAuthUserRepository implements AuthUserRepository {
  private readonly users = new Map<string, AuthUser>();

  async checkConnection(): Promise<void> {
    return await Promise.resolve();
  }

  async getAuthUser(userId: string): Promise<AuthUser | null> {
    return await Promise.resolve(this.users.get(userId) ?? null);
  }

  async updateAuthUser(userId: string, data: AuthUserUpdate): Promise<void> {
    const existing = this.users.get(userId);

    if (!existing) {
      const newUser: AuthUser = {
        id: userId,
        username: data.username ?? "",
        discriminator: data.discriminator ?? "",
        avatar: data.avatar ?? "",
        accessToken: data.accessToken ?? "",
        refreshToken: data.refreshToken ?? "",
        fetchTime: data.fetchTime ?? Date.now(),
      };

      this.users.set(userId, newUser);
      return await Promise.resolve();
    }

    await Promise.resolve(
      this.users.set(userId, {
        ...existing,
        ...data,
      }),
    );
  }

  // test helper
  seed(user: AuthUser): void {
    this.users.set(user.id, user);
  }

  clear(): void {
    this.users.clear();
  }
}
