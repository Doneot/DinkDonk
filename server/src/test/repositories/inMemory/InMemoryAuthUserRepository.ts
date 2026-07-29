import type { AuthUserRepository } from "../../../modules/auth/ports/AuthUserRepository.js";
import type { AuthUser } from "../../../modules/auth/domain/AuthUser.js";
import type { AuthUserUpdate } from "../../../modules/auth/domain/AuthUserUpdate.js";
import {
  AuthUserRecordSchema,
  AuthUserUpdateSchema,
} from "../../../modules/auth/infrastructure/firestore/records/AuthUserRecord.js";

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

    // Wrapped so a validation error building the merged record becomes a
    // rejected promise (matching FirestoreAuthUserRepository) instead of a
    // synchronous throw out of a function typed to return one.
    try {
      const validatedUpdate = AuthUserUpdateSchema.parse(data);
      const existing = this.users.get(userId);

      // Mirrors FirestoreAuthUserRepository: validates the FULL merged
      // record (not just the partial payload), so a partial update that
      // would leave a required field missing throws immediately rather than
      // persisting a corrupt record.
      const merged = AuthUserRecordSchema.parse({
        ...existing,
        ...validatedUpdate,
      });

      this.users.set(userId, { id: userId, ...merged });

      return Promise.resolve();
    } catch (error: unknown) {
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  seed(user: AuthUser): void {
    this.users.set(user.id, structuredClone(user));
  }

  clear(): void {
    this.users.clear();
  }
}
