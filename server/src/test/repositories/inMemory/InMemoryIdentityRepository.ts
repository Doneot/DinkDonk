import { randomUUID } from "crypto";
import type { IdentityRepository } from "../../../modules/auth/ports/IdentityRepository.js";
import type {
  DiscordCredential,
  GoogleCredential,
  Identity,
  TwitchCredential,
} from "../../../modules/auth/domain/Identity.js";
import {
  DiscordCredentialSchema,
  IdentityRecordSchema,
} from "../../../modules/auth/infrastructure/firestore/records/IdentityRecord.js";

import { isNonEmptyString } from "../../../shared/utils/validators.js";
import { IdentityConflictError } from "../../../modules/auth/domain/IdentityConflictError.js";

export class InMemoryIdentityRepository implements IdentityRepository {
  private readonly identities = new Map<string, Identity>();

  // Mirrors FirestoreIdentityRepository's identityLinks collection: maps a
  // "provider:providerId" or "email:address" key to the uid it resolves to.
  private readonly links = new Map<string, string>();

  async checkConnection(): Promise<void> {
    // In-memory is always reachable.
  }

  getIdentity(uid: string): Promise<Identity | null> {
    return Promise.resolve(structuredClone(this.identities.get(uid) ?? null));
  }

  getIdentityByDiscordUid(discordUid: string): Promise<Identity | null> {
    if (!isNonEmptyString(discordUid)) {
      return Promise.resolve(null);
    }

    const uid = this.links.get(`discord:${discordUid}`);

    if (uid === undefined) {
      return Promise.resolve(null);
    }

    return this.getIdentity(uid);
  }

  upsertDiscordIdentity(
    profile: DiscordCredential,
    email: string | null,
    emailVerified: boolean,
  ): Promise<Identity> {
    const discordLinkKey = `discord:${profile.id}`;
    const emailLinkKey =
      email && emailVerified ? `email:${email.toLowerCase()}` : undefined;

    // Same three-case priority as FirestoreIdentityRepository: an existing
    // direct link, then a same-verified-email account to link onto, then a
    // brand new uid equal to the Discord id (also covers pre-migration
    // accounts already keyed by their Discord id).
    const uid =
      this.links.get(discordLinkKey) ??
      (emailLinkKey ? this.links.get(emailLinkKey) : undefined) ??
      profile.id;

    const existing = this.identities.get(uid);

    // Mirrors FirestoreIdentityRepository: validates the FULL merged record,
    // not just the new Discord credential, and preserves any other
    // previously-linked provider already on this uid.
    const merged = IdentityRecordSchema.parse({
      email: email ?? existing?.email ?? null,
      emailVerified: emailVerified || existing?.emailVerified || false,
      discord: profile,
      google: existing?.google,
      twitch: existing?.twitch,
    });

    const identity: Identity = {
      uid,
      email: merged.email,
      emailVerified: merged.emailVerified,
      discord: profile,
      ...(merged.google ? { google: merged.google } : {}),
      ...(merged.twitch ? { twitch: merged.twitch } : {}),
    };

    this.identities.set(uid, identity);
    this.links.set(discordLinkKey, uid);

    if (emailLinkKey && !this.links.has(emailLinkKey)) {
      this.links.set(emailLinkKey, uid);
    }

    return Promise.resolve(structuredClone(identity));
  }

  linkDiscordIdentity(
    uid: string,
    profile: DiscordCredential,
    email: string | null,
    emailVerified: boolean,
  ): Promise<Identity> {
    const discordLinkKey = `discord:${profile.id}`;
    const linkedUid = this.links.get(discordLinkKey);

    if (linkedUid !== undefined && linkedUid !== uid) {
      return Promise.reject(
        new IdentityConflictError(
          "This Discord account is already linked to a different account",
        ),
      );
    }

    const existing = this.identities.get(uid);

    if (!existing) {
      return Promise.reject(new Error(`No identity found for uid ${uid}`));
    }

    // Mirrors FirestoreIdentityRepository: only backfills the account's own
    // email when it doesn't already have one, and never touches the
    // email link index.
    const identity: Identity = {
      ...existing,
      email: existing.email ?? email,
      emailVerified: existing.email ? existing.emailVerified : emailVerified,
      discord: profile,
    };

    this.identities.set(uid, identity);
    this.links.set(discordLinkKey, uid);

    return Promise.resolve(structuredClone(identity));
  }

  updateDiscordCredential(
    uid: string,
    patch: Partial<
      Pick<DiscordCredential, "accessToken" | "refreshToken" | "fetchTime">
    >,
  ): Promise<void> {
    if (!isNonEmptyString(uid)) {
      return Promise.reject(new Error("Invalid user id"));
    }

    try {
      const existing = this.identities.get(uid);

      if (!existing) {
        throw new Error(`No identity found for uid ${uid}`);
      }

      if (!existing.discord) {
        throw new Error(
          `Identity ${uid} has no linked Discord credential to update`,
        );
      }

      const updatedDiscord = DiscordCredentialSchema.parse({
        ...existing.discord,
        ...patch,
      });

      this.identities.set(uid, { ...existing, discord: updatedDiscord });

      return Promise.resolve();
    } catch (error: unknown) {
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  upsertGoogleIdentity(
    profile: GoogleCredential,
    email: string,
    emailVerified: boolean,
  ): Promise<Identity> {
    const googleLinkKey = `google:${profile.id}`;
    const emailLinkKey =
      email && emailVerified ? `email:${email.toLowerCase()}` : undefined;

    const uid =
      this.links.get(googleLinkKey) ??
      (emailLinkKey ? this.links.get(emailLinkKey) : undefined) ??
      randomUUID();

    const existing = this.identities.get(uid);

    const merged = IdentityRecordSchema.parse({
      email: email ?? existing?.email ?? null,
      emailVerified: emailVerified || existing?.emailVerified || false,
      discord: existing?.discord,
      google: profile,
      twitch: existing?.twitch,
    });

    const identity: Identity = {
      uid,
      email: merged.email,
      emailVerified: merged.emailVerified,
      google: profile,
      ...(merged.discord ? { discord: merged.discord } : {}),
      ...(merged.twitch ? { twitch: merged.twitch } : {}),
    };

    this.identities.set(uid, identity);
    this.links.set(googleLinkKey, uid);

    if (emailLinkKey && !this.links.has(emailLinkKey)) {
      this.links.set(emailLinkKey, uid);
    }

    return Promise.resolve(structuredClone(identity));
  }

  upsertTwitchIdentity(
    profile: TwitchCredential,
    email: string | null,
    emailVerified: boolean,
  ): Promise<Identity> {
    const twitchLinkKey = `twitch:${profile.id}`;
    const emailLinkKey =
      email && emailVerified ? `email:${email.toLowerCase()}` : undefined;

    const uid =
      this.links.get(twitchLinkKey) ??
      (emailLinkKey ? this.links.get(emailLinkKey) : undefined) ??
      randomUUID();

    const existing = this.identities.get(uid);

    const merged = IdentityRecordSchema.parse({
      email: email ?? existing?.email ?? null,
      emailVerified: emailVerified || existing?.emailVerified || false,
      discord: existing?.discord,
      google: existing?.google,
      twitch: profile,
    });

    const identity: Identity = {
      uid,
      email: merged.email,
      emailVerified: merged.emailVerified,
      twitch: profile,
      ...(merged.discord ? { discord: merged.discord } : {}),
      ...(merged.google ? { google: merged.google } : {}),
    };

    this.identities.set(uid, identity);
    this.links.set(twitchLinkKey, uid);

    if (emailLinkKey && !this.links.has(emailLinkKey)) {
      this.links.set(emailLinkKey, uid);
    }

    return Promise.resolve(structuredClone(identity));
  }

  seed(identity: Identity): void {
    this.identities.set(identity.uid, structuredClone(identity));

    if (identity.discord) {
      this.links.set(`discord:${identity.discord.id}`, identity.uid);
    }

    if (identity.google) {
      this.links.set(`google:${identity.google.id}`, identity.uid);
    }

    if (identity.twitch) {
      this.links.set(`twitch:${identity.twitch.id}`, identity.uid);
    }

    if (identity.email && identity.emailVerified) {
      this.links.set(`email:${identity.email.toLowerCase()}`, identity.uid);
    }
  }

  clear(): void {
    this.identities.clear();
    this.links.clear();
  }
}
