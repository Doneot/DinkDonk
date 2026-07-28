import type { User } from "../domain/User.js";
import type { UserUpdate } from "../domain/UserUpdate.js";

export interface UserRepository {
  getUser(userId: string): Promise<User | null>;
  getUsers(): Promise<User[]>;
  updateUser(userId: string, data: UserUpdate): Promise<void>;

  /** Count of users with canReceiveDM=true, without loading every document. */
  countUsersReceivingDM(): Promise<number>;
}
