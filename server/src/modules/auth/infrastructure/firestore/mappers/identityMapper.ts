import type { Identity } from "../../../domain/Identity.js";
import type { IdentityRecord } from "../records/IdentityRecord.js";
import { decryptSecret } from "../../../../../shared/utils/crypto.js";

export function toIdentity(uid: string, record: IdentityRecord): Identity {
  return {
    uid,
    email: record.email,
    emailVerified: record.emailVerified,
    ...(record.discord
      ? {
          discord: {
            ...record.discord,
            accessToken: decryptSecret(record.discord.accessToken),
            refreshToken: decryptSecret(record.discord.refreshToken),
          },
        }
      : {}),
    ...(record.google ? { google: record.google } : {}),
    ...(record.twitch ? { twitch: record.twitch } : {}),
  };
}
