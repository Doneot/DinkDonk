import { decryptSecret } from "../../../../../shared/utils/crypto.js";
import type { Identity } from "../../../domain/Identity.js";
import type { IdentityRecord } from "../records/IdentityRecord.js";

export function toIdentity(uid: string, record: IdentityRecord): Identity {
  return {
    uid,
    email: record.email,
    emailVerified: record.emailVerified,
    ...(record.discord
      ? {
          discord: {
            ...record.discord,
            // decryptSecret throws TokenDecryptionError on a corrupt/
            // undecryptable token (e.g. a rotated encryption key). That's
            // expected to propagate to callers of toIdentity/getIdentity,
            // who are expected to either catch it themselves or let it
            // bubble to the centralized HTTP error handler - not handled
            // here.
            accessToken: decryptSecret(record.discord.accessToken),
            refreshToken: decryptSecret(record.discord.refreshToken),
          },
        }
      : {}),
    ...(record.google ? { google: record.google } : {}),
    ...(record.twitch ? { twitch: record.twitch } : {}),
  };
}
