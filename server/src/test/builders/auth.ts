import type { AuthUser } from "../../modules/auth/domain/AuthUser.js";

export function buildAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "discord-user-1",
    username: "test-user",
    discriminator: "0001",
    avatar: "avatar.png",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    fetchTime: Date.now(),
    ...overrides,
  };
}
