import type { AuthUser } from "../../modules/auth/domain/AuthUser.js";

import { TEST_DISCORD_ID } from "../constants.js";

const DEFAULT_FETCH_TIME = 1_700_000_000_000;

export function buildAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: TEST_DISCORD_ID,
    username: "test-user",
    discriminator: "0001",
    avatar: "avatar.png",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    fetchTime: DEFAULT_FETCH_TIME,
    ...overrides,
  };
}
