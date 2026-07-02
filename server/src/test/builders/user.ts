import type { User } from "../../modules/users/domain/User.js";

export function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    canReceiveDM: true,
    subscriptions: [],
    ...overrides,
  };
}
