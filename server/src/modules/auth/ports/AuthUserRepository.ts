import type { AuthUser } from "../domain/AuthUser.js";
import type { AuthUserUpdate } from "../domain/AuthUserUpdate.js";

export interface AuthUserRepository {
  checkConnection(): Promise<void>;
  getAuthUser(userId: string): Promise<AuthUser | null>;
  updateAuthUser(userId: string, data: AuthUserUpdate): Promise<void>;
}
