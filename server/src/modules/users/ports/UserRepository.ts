import type { User } from "../domain/User.js";
import type { UserUpdate } from "../domain/UserUpdate.js";

export interface UserRepository {
  getUser(userId: string): Promise<User | null>;

  /**
   * Currently has zero production callers. `limit` defaults to a sensible
   * cap even when omitted, so this can never accidentally become a truly
   * unbounded collection read once it does get a caller.
   */
  getUsers(limit?: number): Promise<User[]>;
  updateUser(userId: string, data: UserUpdate): Promise<void>;

  /** Count of users with canReceiveDM=true, without loading every document. */
  countUsersReceivingDM(): Promise<number>;
}
