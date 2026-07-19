import type { AuthUserRepository } from "../../../modules/auth/ports/AuthUserRepository.js";
import type { AuthUser } from "../../../modules/auth/domain/AuthUser.js";
import type { AuthUserUpdate } from "../../../modules/auth/domain/AuthUserUpdate.js";

import { isNonEmptyString } from "../../../shared/utils/validators.js";

export class InMemoryAuthUserRepository implements AuthUserRepository {
  private readonly users = new Map<string, AuthUser>();

  async checkConnection(): Promise<void> {
    // Firestore checks that the collection is reachable.
    // Memory implementation is always reachable.
  }

  getAuthUser(userId: string): Promise<AuthUser | null> {
    return Promise.resolve(structuredClone(this.users.get(userId) ?? null));
  }

  updateAuthUser(userId: string, data: AuthUserUpdate): Promise<void> {
    if (!isNonEmptyString(userId)) {
      return Promise.reject(new Error("Invalid user id"));
    }

    const existing = this.users.get(userId);

    this.users.set(userId, {
      id: userId,
      username: existing?.username ?? "",
      discriminator: existing?.discriminator ?? "",
      avatar: existing?.avatar ?? "",
      accessToken: existing?.accessToken ?? "",
      refreshToken: existing?.refreshToken ?? "",
      fetchTime: existing?.fetchTime ?? 0,
      ...data,
    });

    return Promise.resolve();
  }

  seed(user: AuthUser): void {
    this.users.set(user.id, structuredClone(user));
  }

  clear(): void {
    this.users.clear();
  }
}
