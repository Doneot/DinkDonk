import { randomUUID } from "crypto";

import type {
  DiscordCredential,
  GoogleCredential,
  Identity,
  TwitchCredential,
} from "../../../modules/auth/domain/Identity.js";
import { IdentityConflictError } from "../../../modules/auth/domain/IdentityConflictError.js";
import { IdentityNotFoundError } from "../../../modules/auth/domain/IdentityNotFoundError.js";
import {
  DiscordCredentialSchema,
  IdentityRecordSchema,
} from "../../../modules/auth/infrastructure/firestore/records/IdentityRecord.js";
import type { IdentityRepository } from "../../../modules/auth/ports/IdentityRepository.js";
import { isNonEmptyString } from "../../../shared/utils/validators.js";

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

  // Mirrors FirestoreIdentityRepository#upsertIdentity: computed once so
  // "which email wins" and "was this sign-in's email actually verified" stay
  // consistent between the merge below and reassignStaleEmailLink - an
  // unverified email must never demote an already-verified one, nor claim
  // someone else's identityLinks/email:* slot. emailLinkAvailableToThisUid
  // additionally guards a repeat sign-in (an existing direct provider link)
  // whose provider reports a verified email a genuinely DIFFERENT account
  // already owns - without it, this account's own stored email would get
  // silently overwritten to a value it has no actual identityLinks claim on
  // (that index itself is never touched here regardless, so this is a
  // display-consistency guard, not a security one).
  private mergeEmail(
    existing: Identity | undefined,
    email: string | null,
    emailVerified: boolean,
    emailLinkAvailableToThisUid: boolean,
  ): { email: string | null; emailVerified: boolean } {
    const emailIsClaimable = emailVerified === true && emailLinkAvailableToThisUid;

    return emailIsClaimable
      ? { email: email ?? existing?.email ?? null, emailVerified: true }
      : {
          email: existing?.email ?? email ?? null,
          emailVerified: existing?.emailVerified ?? false,
        };
  }

  // Only differs from "is emailLinkKey unclaimed" in the repeat-sign-in
  // case: a brand-new account has no conflict to check, and the by-email
  // auto-link case resolves uid FROM this same key, so it's trivially its
  // own owner there too.
  private isEmailLinkAvailableToUid(
    emailLinkKey: string | undefined,
    uid: string,
  ): boolean {
    const owner = emailLinkKey ? this.links.get(emailLinkKey) : undefined;

    return owner === undefined || owner === uid;
  }

  // Mirrors FirestoreIdentityRepository#upsertIdentity's staleEmailLinkRef
  // handling: on a repeat sign-in (an existing direct provider link, as
  // opposed to a brand-new account) whose newly-verified email differs from
  // what's already stored, the OLD identityLinks/email:{oldEmail} entry -
  // if it still points to this uid - must stop pointing here. Left alone,
  // it becomes a permanent, stale claim on an email this account no longer
  // owns: a future sign-in via ANY provider reporting that same email as
  // verified again (plausible once the mailbox is recycled/reassigned)
  // would resolve straight onto this account, a silent account takeover.
  private reassignStaleEmailLink(
    uid: string,
    isRepeatSignIn: boolean,
    existing: Identity | undefined,
    emailIsVerified: boolean,
    newEmail: string | null,
  ): void {
    const staleKey = existing?.email
      ? `email:${existing.email.toLowerCase()}`
      : null;
    const newKey = newEmail ? `email:${newEmail.toLowerCase()}` : null;

    if (
      !isRepeatSignIn ||
      !emailIsVerified ||
      !staleKey ||
      // Compares the normalized (lowercased) keys, not the raw email
      // strings - the old and new email can differ only by letter-casing
      // (e.g. "Old@Example.com" then "old@example.com" for the same
      // address) while resolving to the SAME identityLinks key. A raw
      // comparison would treat that as a real change and delete this
      // account's own, still-valid email claim (only surviving today
      // because the caller happens to unconditionally re-insert any missing
      // emailLinkKey right after this runs - not something this method
      // should depend on).
      staleKey === newKey
    ) {
      return;
    }

    if (this.links.get(staleKey) === uid) {
      this.links.delete(staleKey);
    }
  }

  upsertDiscordIdentity(
    profile: DiscordCredential,
    email: string | null,
    emailVerified: boolean,
  ): Promise<Identity> {
    const discordLinkKey = `discord:${profile.id}`;
    const emailLinkKey =
      email && emailVerified ? `email:${email.toLowerCase()}` : undefined;
    const isRepeatSignIn = this.links.has(discordLinkKey);

    // Same three-case priority as FirestoreIdentityRepository: an existing
    // direct link, then a same-verified-email account to link onto, then a
    // brand new uid equal to the Discord id (also covers pre-migration
    // accounts already keyed by their Discord id).
    const uid =
      this.links.get(discordLinkKey) ??
      (emailLinkKey ? this.links.get(emailLinkKey) : undefined) ??
      profile.id;

    const existing = this.identities.get(uid);
    const emailLinkAvailableToThisUid = this.isEmailLinkAvailableToUid(
      emailLinkKey,
      uid,
    );
    const emailMerge = this.mergeEmail(
      existing,
      email,
      emailVerified,
      emailLinkAvailableToThisUid,
    );

    // Mirrors FirestoreIdentityRepository: validates the FULL merged record,
    // not just the new Discord credential, and preserves any other
    // previously-linked provider already on this uid.
    const merged = IdentityRecordSchema.parse({
      ...emailMerge,
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

    this.reassignStaleEmailLink(
      uid,
      isRepeatSignIn,
      existing,
      emailVerified === true,
      merged.email,
    );

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
      return Promise.reject(
        new IdentityNotFoundError(`No identity found for uid ${uid}`),
      );
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

    // Re-linking to a different Discord account than the one already on
    // file must repoint (not leave behind) the OLD discord:{oldId} link -
    // mirrors FirestoreIdentityRepository.linkDiscordIdentity's
    // staleDiscordLinkRef cleanup, so a later plain sign-in via the old
    // Discord account doesn't silently resolve back onto this uid.
    if (
      existing.discord &&
      existing.discord.id !== profile.id &&
      this.links.get(`discord:${existing.discord.id}`) === uid
    ) {
      this.links.delete(`discord:${existing.discord.id}`);
    }

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
        throw new IdentityNotFoundError(`No identity found for uid ${uid}`);
      }

      if (!existing.discord) {
        throw new IdentityNotFoundError(
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
    const isRepeatSignIn = this.links.has(googleLinkKey);

    const uid =
      this.links.get(googleLinkKey) ??
      (emailLinkKey ? this.links.get(emailLinkKey) : undefined) ??
      randomUUID();

    const existing = this.identities.get(uid);
    const emailLinkAvailableToThisUid = this.isEmailLinkAvailableToUid(
      emailLinkKey,
      uid,
    );
    const emailMerge = this.mergeEmail(
      existing,
      email,
      emailVerified,
      emailLinkAvailableToThisUid,
    );

    const merged = IdentityRecordSchema.parse({
      ...emailMerge,
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

    this.reassignStaleEmailLink(
      uid,
      isRepeatSignIn,
      existing,
      emailVerified === true,
      merged.email,
    );

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
    const isRepeatSignIn = this.links.has(twitchLinkKey);

    const uid =
      this.links.get(twitchLinkKey) ??
      (emailLinkKey ? this.links.get(emailLinkKey) : undefined) ??
      randomUUID();

    const existing = this.identities.get(uid);
    const emailLinkAvailableToThisUid = this.isEmailLinkAvailableToUid(
      emailLinkKey,
      uid,
    );
    const emailMerge = this.mergeEmail(
      existing,
      email,
      emailVerified,
      emailLinkAvailableToThisUid,
    );

    const merged = IdentityRecordSchema.parse({
      ...emailMerge,
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

    this.reassignStaleEmailLink(
      uid,
      isRepeatSignIn,
      existing,
      emailVerified === true,
      merged.email,
    );

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
