import { randomUUID } from "crypto";
import type {
  Firestore,
  CollectionReference,
  DocumentReference,
  DocumentData,
} from "firebase-admin/firestore";

import type {
  DiscordCredential,
  GoogleCredential,
  Identity,
  TwitchCredential,
} from "../../domain/Identity.js";
import type { IdentityRepository } from "../../ports/IdentityRepository.js";
import {
  DiscordCredentialSchema,
  IdentityRecordSchema,
} from "./records/IdentityRecord.js";
import type { IdentityRecord } from "./records/IdentityRecord.js";

import { isNonEmptyString } from "../../../../shared/utils/validators.js";
import { encryptSecret } from "../../../../shared/utils/crypto.js";
import { getExistingDoc } from "../../../../shared/utils/firestore.js";
import { toIdentity } from "./mappers/identityMapper.js";
import { IdentityConflictError } from "../../domain/IdentityConflictError.js";

function discordLinkId(discordId: string): string {
  return `discord:${discordId}`;
}

function googleLinkId(googleId: string): string {
  return `google:${googleId}`;
}

function twitchLinkId(twitchId: string): string {
  return `twitch:${twitchId}`;
}

function emailLinkId(email: string): string {
  return `email:${email.toLowerCase()}`;
}

// Validates only accessToken/refreshToken, but against the PLAINTEXT value -
// callers must run this before encryptSecret() touches either field.
// encryptSecret("") still produces a non-empty ciphertext string, so a blank
// token can only ever be caught here; validating the already-encrypted
// record (as IdentityRecordSchema.parse does further down) can never catch
// it.
const PlaintextDiscordTokenPatchSchema = DiscordCredentialSchema.pick({
  accessToken: true,
  refreshToken: true,
}).partial();

export class FirestoreIdentityRepository implements IdentityRepository {
  private readonly identities: CollectionReference<DocumentData>;
  private readonly identityLinks: CollectionReference<DocumentData>;

  constructor(private readonly db: Firestore) {
    this.identities = db.collection("identities");
    this.identityLinks = db.collection("identityLinks");
  }

  async checkConnection(): Promise<void> {
    await this.identities.limit(1).get();
  }

  async getIdentity(uid: string): Promise<Identity | null> {
    const doc = await getExistingDoc(this.identities, uid);

    if (!doc) {
      return null;
    }

    return toIdentity(uid, IdentityRecordSchema.parse(doc.data()));
  }

  async getIdentityByDiscordUid(discordUid: string): Promise<Identity | null> {
    if (!isNonEmptyString(discordUid)) {
      return null;
    }

    // Follows the exact identityLinks/discord:{id} pattern used everywhere
    // else in this file to resolve a provider id to this app's canonical
    // uid, then defers to getIdentity for the actual record fetch/parse.
    const linkDoc = await getExistingDoc(
      this.identityLinks,
      discordLinkId(discordUid),
    );

    if (!linkDoc) {
      return null;
    }

    const { uid } = linkDoc.data() as { uid: string };

    return this.getIdentity(uid);
  }

  /**
   * Shared transaction structure behind upsertDiscordIdentity /
   * upsertGoogleIdentity / upsertTwitchIdentity: resolve the target uid via
   * the direct provider link (falling back to a verified-email match, then
   * finally minting a new uid), read-modify-write the identity record, and
   * maintain both index docs. Each provider-specific field (encryption,
   * which nested key to set, etc.) is supplied by the caller via
   * `buildProviderFields`; everything else about the merge is identical
   * across providers.
   */
  private async upsertIdentity(params: {
    linkRef: DocumentReference<DocumentData>;
    emailLinkRef: DocumentReference<DocumentData> | null;
    email: string | null;
    emailVerified: boolean;
    mintUid: () => string;
    buildProviderFields: () => Partial<IdentityRecord>;
  }): Promise<Identity> {
    const { linkRef, emailLinkRef, email, emailVerified, mintUid, buildProviderFields } =
      params;

    return this.db.runTransaction(async (tx) => {
      const linkDoc = await tx.get(linkRef);

      // Always read the email index doc (when there is one to read) - even
      // on a repeat sign-in where it won't be used to resolve the uid below.
      // Firestore transactions only guard a tx.set/tx.update against
      // concurrent writes if a tx.get on that same doc happened first in
      // this transaction; skipping this read on the repeat-sign-in path
      // used to mean the tx.set(emailLinkRef, ...) further down ran with NO
      // read-before-write, i.e. zero optimistic-concurrency protection, and
      // (via the `!emailLinkDoc?.exists` check below evaluating true for a
      // skipped/null read) could blindly reassign an email index doc
      // already claimed by a different account onto this one.
      const emailLinkDoc = emailLinkRef ? await tx.get(emailLinkRef) : null;

      // Three cases, in priority order: (1) this provider account already
      // has a uid - use it; (2) no direct link, but another provider already
      // claimed this verified email - link onto that existing account; (3)
      // brand new - mint a uid via the caller's strategy.
      const uid = linkDoc.exists
        ? (linkDoc.data() as { uid: string }).uid
        : emailLinkDoc?.exists
          ? (emailLinkDoc.data() as { uid: string }).uid
          : mintUid();

      const identityRef = this.identities.doc(uid);
      const existingDoc = await tx.get(identityRef);
      const existing = existingDoc.exists
        ? IdentityRecordSchema.parse(existingDoc.data())
        : undefined;

      // The new email/emailVerified only get to replace what's already
      // stored when THIS sign-in's email is itself verified - an unverified
      // email must never be allowed to either (a) claim someone else's
      // identityLinks/email:* slot (handled above) or (b) demote/replace an
      // account's already-verified email while inheriting its
      // emailVerified=true, which is what a plain `||` merge against the OLD
      // verified state used to allow. When unverified, the previously
      // stored email/verified pair is kept as-is (falling back to the new
      // email only if the account doesn't have one yet at all).
      const emailIsVerified = emailVerified === true;

      // Also required: the target identityLinks/email:* slot must actually
      // be available to THIS uid - either unclaimed, or already claimed by
      // this same account. This only differs from emailIsVerified alone in
      // case 1 (an existing direct provider link): case 2's uid is itself
      // resolved FROM emailLinkDoc, so it's always already this account's
      // own slot there, and case 3 has no emailLinkDoc to conflict with.
      // Without this, a repeat sign-in whose provider reports a verified
      // email that a genuinely different account already owns (two
      // different people, or the same person's two separate accounts, each
      // independently verified that address with a different provider)
      // would overwrite THIS account's own stored email to a value it has
      // no actual claim on - the identityLinks index itself stays correctly
      // pointed at the real owner (untouched below), but this account would
      // display an email it doesn't control.
      const emailLinkAvailableToThisUid =
        !emailLinkDoc?.exists ||
        (emailLinkDoc.data() as { uid: string }).uid === uid;
      const emailIsClaimable = emailIsVerified && emailLinkAvailableToThisUid;

      const mergedEmail = emailIsClaimable
        ? (email ?? existing?.email ?? null)
        : (existing?.email ?? email ?? null);
      const mergedEmailVerified = emailIsClaimable
        ? true
        : (existing?.emailVerified ?? false);

      // On a repeat sign-in (case 1 above) whose newly-verified email
      // differs from what's already stored, the OLD
      // identityLinks/email:{oldEmail} doc - if it still points to this uid
      // - must stop pointing here in the same transaction the new one is
      // claimed in below. Left alone, it becomes a permanent, stale claim on
      // an email this account no longer owns: a future sign-in via ANY
      // provider reporting that same email as verified again - plausible
      // once the mailbox is recycled/reassigned by its provider - would
      // resolve straight onto this account via case 2 above, a silent
      // account takeover.
      let staleEmail: string | null = null;

      if (
        linkDoc.exists &&
        emailIsVerified &&
        existing?.email &&
        mergedEmail &&
        // Compares via emailLinkId (which lowercases), not the raw strings -
        // the old and new email can differ only by letter-casing (a
        // provider reporting "Old@Example.com" then "old@example.com" for
        // the exact same address) while still resolving to the SAME
        // identityLinks/email:* doc. A raw string comparison here would
        // treat that as a real email change, but emailLinkRef (built by the
        // caller from the new email) and staleEmailLinkRef would then be
        // the identical doc reference - the "create if absent" write below
        // gets skipped (it already exists), and this doc would get deleted
        // with nothing left pointing at this account's own, still-valid
        // email claim.
        emailLinkId(existing.email) !== emailLinkId(mergedEmail)
      ) {
        staleEmail = existing.email;
      }

      const staleEmailLinkRef = staleEmail
        ? this.identityLinks.doc(emailLinkId(staleEmail))
        : null;
      const staleEmailLinkDoc = staleEmailLinkRef
        ? await tx.get(staleEmailLinkRef)
        : null;

      // Validates the FULL record this write results in, not just the new
      // provider credential - a corrupt merge fails loudly here rather than
      // persisting a document that only breaks the next time it's read.
      // Spreads ...existing first so a previously-linked provider isn't
      // dropped from the returned Identity - {merge: true} would've kept it
      // in Firestore regardless, but the return value is built from this
      // same object and must reflect the full picture.
      const merged = IdentityRecordSchema.parse({
        ...existing,
        email: mergedEmail,
        emailVerified: mergedEmailVerified,
        ...buildProviderFields(),
      });

      tx.set(identityRef, merged, { merge: true });

      if (!linkDoc.exists) {
        tx.set(linkRef, { uid });
      }

      if (emailLinkRef && !emailLinkDoc?.exists) {
        tx.set(emailLinkRef, { uid });
      }

      // Only deletes if it still points to this exact uid - guards against
      // deleting a link doc some other, unrelated concurrent write already
      // repointed elsewhere.
      if (
        staleEmailLinkRef &&
        staleEmailLinkDoc?.exists &&
        (staleEmailLinkDoc.data() as { uid: string }).uid === uid
      ) {
        tx.delete(staleEmailLinkRef);
      }

      return toIdentity(uid, merged);
    });
  }

  async upsertDiscordIdentity(
    profile: DiscordCredential,
    email: string | null,
    emailVerified: boolean,
  ): Promise<Identity> {
    // Validates the RAW plaintext credential before accessToken/refreshToken
    // are encrypted below - see PlaintextDiscordTokenPatchSchema's comment.
    DiscordCredentialSchema.parse(profile);

    const discordLinkRef = this.identityLinks.doc(discordLinkId(profile.id));
    const emailLinkRef =
      email && emailVerified ? this.identityLinks.doc(emailLinkId(email)) : null;

    // Case 3 (brand new) mints a uid equal to the Discord id itself, unlike
    // Google/Twitch below - this is also what makes pre-migration accounts
    // (which were keyed by their Discord id under the old `auth/{id}`
    // collection) work transparently: the first login after migration finds
    // no link doc, falls through to "uid = discordId", and that happens to
    // be the id their existing `users/{id}` document already uses - no
    // backfill script needed.
    return this.upsertIdentity({
      linkRef: discordLinkRef,
      emailLinkRef,
      email,
      emailVerified,
      mintUid: () => profile.id,
      buildProviderFields: () => ({
        discord: {
          ...profile,
          accessToken: encryptSecret(profile.accessToken),
          refreshToken: encryptSecret(profile.refreshToken),
        },
      }),
    });
  }

  async linkDiscordIdentity(
    uid: string,
    profile: DiscordCredential,
    email: string | null,
    emailVerified: boolean,
  ): Promise<Identity> {
    // Validates the RAW plaintext credential before accessToken/refreshToken
    // are encrypted below - see PlaintextDiscordTokenPatchSchema's comment.
    DiscordCredentialSchema.parse(profile);

    const discordLinkRef = this.identityLinks.doc(discordLinkId(profile.id));

    return this.db.runTransaction(async (tx) => {
      const discordLinkDoc = await tx.get(discordLinkRef);
      const identityRef = this.identities.doc(uid);
      const existingDoc = await tx.get(identityRef);

      if (
        discordLinkDoc.exists &&
        (discordLinkDoc.data() as { uid: string }).uid !== uid
      ) {
        throw new IdentityConflictError(
          "This Discord account is already linked to a different account",
        );
      }

      if (!existingDoc.exists) {
        throw new Error(`No identity found for uid ${uid}`);
      }

      const existing = IdentityRecordSchema.parse(existingDoc.data());

      // Re-linking to a DIFFERENT Discord account than the one already on
      // file (e.g. /discord/link authorized against a different Discord
      // profile than at signup) must repoint identityLinks/discord:{oldId}
      // away from this uid in the same transaction the new one is claimed
      // in below. Left alone, it stays a live pointer to this account - a
      // later plain Discord sign-in via that old account (upsertDiscordIdentity)
      // would resolve straight back onto this uid, silently reverting the
      // user's chosen re-link with no error or warning.
      const staleDiscordId =
        existing.discord && existing.discord.id !== profile.id
          ? existing.discord.id
          : null;

      const staleDiscordLinkRef = staleDiscordId
        ? this.identityLinks.doc(discordLinkId(staleDiscordId))
        : null;
      const staleDiscordLinkDoc = staleDiscordLinkRef
        ? await tx.get(staleDiscordLinkRef)
        : null;

      // Only backfills the account's own email when it doesn't already have
      // one - an established email is left alone rather than overwritten by
      // whatever this newly-linked Discord profile reports (deliberately not
      // touching the identityLinks/email:* index either way: that index is
      // what future logins resolve an account by, and this is an explicit,
      // one-off connect action rather than an automatic email-match merge).
      const merged = IdentityRecordSchema.parse({
        ...existing,
        email: existing.email ?? email,
        emailVerified: existing.email
          ? existing.emailVerified
          : emailVerified,
        discord: {
          ...profile,
          accessToken: encryptSecret(profile.accessToken),
          refreshToken: encryptSecret(profile.refreshToken),
        },
      });

      tx.set(identityRef, merged, { merge: true });

      if (!discordLinkDoc.exists) {
        tx.set(discordLinkRef, { uid });
      }

      // Only deletes if it still points to this exact uid - guards against
      // deleting a link doc some other, unrelated concurrent write already
      // repointed elsewhere.
      if (
        staleDiscordLinkRef &&
        staleDiscordLinkDoc?.exists &&
        (staleDiscordLinkDoc.data() as { uid: string }).uid === uid
      ) {
        tx.delete(staleDiscordLinkRef);
      }

      return toIdentity(uid, merged);
    });
  }

  async updateDiscordCredential(
    uid: string,
    patch: Partial<
      Pick<DiscordCredential, "accessToken" | "refreshToken" | "fetchTime">
    >,
  ): Promise<void> {
    if (!isNonEmptyString(uid)) {
      throw new Error("Invalid user id");
    }

    // Validates the RAW plaintext patch before accessToken/refreshToken are
    // encrypted below - see PlaintextDiscordTokenPatchSchema's comment.
    PlaintextDiscordTokenPatchSchema.parse(patch);

    const identityRef = this.identities.doc(uid);

    await this.db.runTransaction(async (tx) => {
      const doc = await tx.get(identityRef);

      if (!doc.exists) {
        throw new Error(`No identity found for uid ${uid}`);
      }

      const existing = IdentityRecordSchema.parse(doc.data());

      if (!existing.discord) {
        throw new Error(
          `Identity ${uid} has no linked Discord credential to update`,
        );
      }

      const encryptedPatch = {
        ...patch,
        ...(patch.accessToken !== undefined
          ? { accessToken: encryptSecret(patch.accessToken) }
          : {}),
        ...(patch.refreshToken !== undefined
          ? { refreshToken: encryptSecret(patch.refreshToken) }
          : {}),
      };

      // Reads the existing (already-encrypted) credential, applies the
      // patch, and writes the FULL nested object back - rather than relying
      // on Firestore's own merge to combine nested map fields, which would
      // require dotted mergeFields to avoid clobbering sibling fields like
      // username/avatar. Full read-modify-write sidesteps that entirely.
      const updatedDiscord = DiscordCredentialSchema.parse({
        ...existing.discord,
        ...encryptedPatch,
      });

      tx.set(identityRef, { discord: updatedDiscord }, { merge: true });
    });
  }

  async upsertGoogleIdentity(
    profile: GoogleCredential,
    email: string,
    emailVerified: boolean,
  ): Promise<Identity> {
    const googleLinkRef = this.identityLinks.doc(googleLinkId(profile.id));
    const emailLinkRef =
      email && emailVerified ? this.identityLinks.doc(emailLinkId(email)) : null;

    // Same priority order as upsertDiscordIdentity, but with no Discord-era
    // legacy data to stay compatible with: a brand new Google signup always
    // mints a fresh random uid rather than reusing profile.id.
    return this.upsertIdentity({
      linkRef: googleLinkRef,
      emailLinkRef,
      email,
      emailVerified,
      mintUid: () => randomUUID(),
      buildProviderFields: () => ({ google: profile }),
    });
  }

  async upsertTwitchIdentity(
    profile: TwitchCredential,
    email: string | null,
    emailVerified: boolean,
  ): Promise<Identity> {
    const twitchLinkRef = this.identityLinks.doc(twitchLinkId(profile.id));
    const emailLinkRef =
      email && emailVerified ? this.identityLinks.doc(emailLinkId(email)) : null;

    // Same priority order as upsertGoogleIdentity: no Twitch-era legacy
    // data to stay compatible with, so a brand new Twitch signup always
    // mints a fresh random uid rather than reusing profile.id.
    return this.upsertIdentity({
      linkRef: twitchLinkRef,
      emailLinkRef,
      email,
      emailVerified,
      mintUid: () => randomUUID(),
      buildProviderFields: () => ({ twitch: profile }),
    });
  }
}
