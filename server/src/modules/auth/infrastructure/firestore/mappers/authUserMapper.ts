import type { AuthUser } from "../../../domain/AuthUser.js";

import type { AuthUserRecord } from "../records/AuthUserRecord.js";

export function toAuthUser(id: string, record: AuthUserRecord): AuthUser {
  return {
    id,

    username: record.username,
    discriminator: record.discriminator,
    avatar: record.avatar,

    accessToken: record.accessToken,
    refreshToken: record.refreshToken,

    fetchTime: record.fetchTime,
  };
}
