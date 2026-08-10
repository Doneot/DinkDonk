import type { User } from "../../modules/users/domain/User.js";

import { TEST_USER_ID } from "../constants.js";

export function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: TEST_USER_ID,
    canReceiveDM: true,
    subscriptions: [],
    notificationPreferences: {},
    ...overrides,
  };
}
