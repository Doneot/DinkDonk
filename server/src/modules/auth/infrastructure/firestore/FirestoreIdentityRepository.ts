import { randomUUID } from "crypto";
import type {
  Firestore,
  CollectionReference,
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

import { isNonEmptyString } from "../../../../shared/utils/validators.js";
import { encryptSecret } from "../../../../shared/utils/crypto.js";
import { getExistingDoc } from "../../../../shared/utils/firestore.js";
import { toIdentity } from "./mappers/identityMapper.js";
import { ConflictError } from "../../../../http/errors/ConflictError.js";

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

  async upsertDiscordIdentity(
    profile: DiscordCredential,
    email: string | null,
    emailVerified: boolean,
  ): Promise<Identity> {
    const discordLinkRef = this.identityLinks.doc(discordLinkId(profile.id));
    const emailLinkRef =
      email && emailVerified ? this.identityLinks.doc(emailLinkId(email)) : null;

    return this.db.runTransaction(async (tx) => {
      const discordLinkDoc = await tx.get(discordLinkRef);

      // Only consult the email index when there's no direct Discord link yet
      // (first time this Discord account has ever signed in here).
      const emailLinkDoc =
        !discordLinkDoc.exists && emailLinkRef ? await tx.get(emailLinkRef) : null;

      // Three cases, in priority order: (1) this Discord account already has
      // a uid - use it; (2) no direct link, but another provider already
      // claimed this verified email - link onto that existing account; (3)
      // brand new - mint a uid equal to the Discord id itself. Case 3 is also
      // what makes pre-migration accounts (which were keyed by their Discord
      // id under the old `auth/{id}` collection) work transparently: the
      // first login after migration finds no link doc, falls through to
      // "uid = discordId", and that happens to be the id their existing
      // `users/{id}` document already uses - no backfill script needed.
      const uid = discordLinkDoc.exists
        ? (discordLinkDoc.data() as { uid: string }).uid
        : emailLinkDoc?.exists
          ? (emailLinkDoc.data() as { uid: string }).uid
          : profile.id;

      const identityRef = this.identities.doc(uid);
      const existingDoc = await tx.get(identityRef);
      const existing = existingDoc.exists
        ? IdentityRecordSchema.parse(existingDoc.data())
        : undefined;

      // Validates the FULL record this write results in, not just the new
      // Discord credential - a corrupt merge fails loudly here rather than
      // persisting a document that only breaks the next time it's read.
      // Spreads ...existing first so a previously-linked provider (e.g.
      // google) isn't dropped from the returned Identity - {merge: true}
      // would've kept it in Firestore regardless, but the return value is
      // built from this same object and must reflect the full picture.
      const merged = IdentityRecordSchema.parse({
        ...existing,
        email: email ?? existing?.email ?? null,
        emailVerified: emailVerified || existing?.emailVerified || false,
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

      if (emailLinkRef && !emailLinkDoc?.exists) {
        tx.set(emailLinkRef, { uid });
      }

      return toIdentity(uid, merged);
    });
  }

  async linkDiscordIdentity(
    uid: string,
    profile: DiscordCredential,
  ): Promise<Identity> {
    const discordLinkRef = this.identityLinks.doc(discordLinkId(profile.id));

    return this.db.runTransaction(async (tx) => {
      const discordLinkDoc = await tx.get(discordLinkRef);
      const identityRef = this.identities.doc(uid);
      const existingDoc = await tx.get(identityRef);

      if (
        discordLinkDoc.exists &&
        (discordLinkDoc.data() as { uid: string }).uid !== uid
      ) {
        throw new ConflictError(
          "This Discord account is already linked to a different account",
        );
      }

      if (!existingDoc.exists) {
        throw new Error(`No identity found for uid ${uid}`);
      }

      const existing = IdentityRecordSchema.parse(existingDoc.data());

      const merged = IdentityRecordSchema.parse({
        ...existing,
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

    return this.db.runTransaction(async (tx) => {
      const googleLinkDoc = await tx.get(googleLinkRef);

      const emailLinkDoc =
        !googleLinkDoc.exists && emailLinkRef ? await tx.get(emailLinkRef) : null;

      // Same priority order as upsertDiscordIdentity, but with no Discord-era
      // legacy data to stay compatible with: a brand new Google signup always
      // mints a fresh random uid rather than reusing profile.id.
      const uid = googleLinkDoc.exists
        ? (googleLinkDoc.data() as { uid: string }).uid
        : emailLinkDoc?.exists
          ? (emailLinkDoc.data() as { uid: string }).uid
          : randomUUID();

      const identityRef = this.identities.doc(uid);
      const existingDoc = await tx.get(identityRef);
      const existing = existingDoc.exists
        ? IdentityRecordSchema.parse(existingDoc.data())
        : undefined;

      const merged = IdentityRecordSchema.parse({
        ...existing,
        email: email ?? existing?.email ?? null,
        emailVerified: emailVerified || existing?.emailVerified || false,
        google: profile,
      });

      tx.set(identityRef, merged, { merge: true });

      if (!googleLinkDoc.exists) {
        tx.set(googleLinkRef, { uid });
      }

      if (emailLinkRef && !emailLinkDoc?.exists) {
        tx.set(emailLinkRef, { uid });
      }

      return toIdentity(uid, merged);
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

    return this.db.runTransaction(async (tx) => {
      const twitchLinkDoc = await tx.get(twitchLinkRef);

      const emailLinkDoc =
        !twitchLinkDoc.exists && emailLinkRef ? await tx.get(emailLinkRef) : null;

      // Same priority order as upsertGoogleIdentity: no Twitch-era legacy
      // data to stay compatible with, so a brand new Twitch signup always
      // mints a fresh random uid rather than reusing profile.id.
      const uid = twitchLinkDoc.exists
        ? (twitchLinkDoc.data() as { uid: string }).uid
        : emailLinkDoc?.exists
          ? (emailLinkDoc.data() as { uid: string }).uid
          : randomUUID();

      const identityRef = this.identities.doc(uid);
      const existingDoc = await tx.get(identityRef);
      const existing = existingDoc.exists
        ? IdentityRecordSchema.parse(existingDoc.data())
        : undefined;

      const merged = IdentityRecordSchema.parse({
        ...existing,
        email: email ?? existing?.email ?? null,
        emailVerified: emailVerified || existing?.emailVerified || false,
        twitch: profile,
      });

      tx.set(identityRef, merged, { merge: true });

      if (!twitchLinkDoc.exists) {
        tx.set(twitchLinkRef, { uid });
      }

      if (emailLinkRef && !emailLinkDoc?.exists) {
        tx.set(emailLinkRef, { uid });
      }

      return toIdentity(uid, merged);
    });
  }
}
