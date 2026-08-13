import { describe, expect, it } from "vitest";

import type { Identity } from "../../../modules/auth/domain/Identity.js";
import { IdentityNotFoundError } from "../../../modules/auth/domain/IdentityNotFoundError.js";
import type { IdentityRepository } from "../../../modules/auth/ports/IdentityRepository.js";
import {
  buildDiscordCredential,
  buildGoogleCredential,
  buildIdentity,
  buildTwitchCredential,
} from "../../builders/auth.js";
import type { SeededRepositoryFactory } from "./SeededRepository.js";

export function identityRepositoryBehavior(
  name: string,
  createRepository: SeededRepositoryFactory<IdentityRepository, [Identity]>,
): void {
  describe(name, () => {
    it("checkConnection succeeds", async () => {
      const repository = createRepository();

      await expect(repository.checkConnection()).resolves.toBeUndefined();
    });

    it("starts empty", async () => {
      const repository = createRepository();

      await expect(repository.getIdentity("missing")).resolves.toBeNull();
    });

    it("returns a seeded identity", async () => {
      const repository = createRepository();

      const identity = buildIdentity();

      repository.seed(identity);

      await expect(repository.getIdentity(identity.uid)).resolves.toEqual(
        identity,
      );
    });

    describe("getIdentityByDiscordUid", () => {
      it("resolves a linked Discord uid to the account's canonical uid", async () => {
        const repository = createRepository();

        const identity = buildIdentity({
          uid: "canonical-uid",
          discord: buildDiscordCredential({ id: "discord-snowflake-1" }),
        });

        repository.seed(identity);

        await expect(
          repository.getIdentityByDiscordUid("discord-snowflake-1"),
        ).resolves.toEqual(identity);
      });

      it("returns null for a Discord id that isn't linked to any account", async () => {
        const repository = createRepository();

        await expect(
          repository.getIdentityByDiscordUid("unknown-discord-id"),
        ).resolves.toBeNull();
      });

      it.each(["", "   "])(
        "returns null for a blank Discord id %j",
        async (discordUid) => {
          const repository = createRepository();

          await expect(
            repository.getIdentityByDiscordUid(discordUid),
          ).resolves.toBeNull();
        },
      );
    });

    it("creates a new identity (uid = discord id) for a first-time Discord sign-in", async () => {
      const repository = createRepository();

      const credential = buildDiscordCredential({ id: "discord-1" });

      const identity = await repository.upsertDiscordIdentity(
        credential,
        null,
        false,
      );

      expect(identity).toEqual({
        uid: "discord-1",
        email: null,
        emailVerified: false,
        discord: credential,
      });
      await expect(repository.getIdentity("discord-1")).resolves.toEqual(
        identity,
      );
    });

    it("resolves to the same uid on a repeat Discord sign-in", async () => {
      const repository = createRepository();

      const first = await repository.upsertDiscordIdentity(
        buildDiscordCredential({ id: "discord-1", username: "old-name" }),
        null,
        false,
      );

      const second = await repository.upsertDiscordIdentity(
        buildDiscordCredential({ id: "discord-1", username: "new-name" }),
        null,
        false,
      );

      expect(second.uid).toBe(first.uid);
      expect(second.discord?.username).toBe("new-name");
    });

    it("links a new Discord sign-in onto an existing identity with the same verified email", async () => {
      const repository = createRepository();

      repository.seed(
        buildIdentity({
          uid: "existing-uid",
          email: "person@example.com",
          emailVerified: true,
          discord: undefined,
        }),
      );

      const identity = await repository.upsertDiscordIdentity(
        buildDiscordCredential({ id: "discord-2" }),
        "person@example.com",
        true,
      );

      expect(identity.uid).toBe("existing-uid");
      await expect(
        repository.upsertDiscordIdentity(
          buildDiscordCredential({ id: "discord-2" }),
          "person@example.com",
          true,
        ),
      ).resolves.toMatchObject({ uid: "existing-uid" });
    });

    it("does not link by email when the provider hasn't verified it", async () => {
      const repository = createRepository();

      repository.seed(
        buildIdentity({
          uid: "existing-uid",
          email: "person@example.com",
          emailVerified: true,
          discord: undefined,
        }),
      );

      const identity = await repository.upsertDiscordIdentity(
        buildDiscordCredential({ id: "discord-3" }),
        "person@example.com",
        false,
      );

      // An unverified email must not be trusted to claim someone else's
      // account - falls through to minting a brand new uid instead.
      expect(identity.uid).toBe("discord-3");
    });

    it("releases the old email link when a repeat sign-in reports a new verified email, instead of leaving it claimable forever", async () => {
      const repository = createRepository();

      const first = await repository.upsertDiscordIdentity(
        buildDiscordCredential({ id: "discord-1" }),
        "old@example.com",
        true,
      );

      // Same Discord account signs in again, but the provider now reports a
      // different verified email (e.g. the user changed it at Discord).
      const second = await repository.upsertDiscordIdentity(
        buildDiscordCredential({ id: "discord-1" }),
        "new@example.com",
        true,
      );

      expect(second.uid).toBe(first.uid);
      expect(second.email).toBe("new@example.com");

      // The old email must not still resolve onto this account - otherwise
      // a completely different, unrelated sign-in that later reports
      // "old@example.com" as its own verified email (e.g. the mailbox gets
      // recycled/reassigned by its provider) would silently take over this
      // account via the same-verified-email linking path above.
      const unrelated = await repository.upsertGoogleIdentity(
        buildGoogleCredential({ id: "google-unrelated" }),
        "old@example.com",
        true,
      );

      expect(unrelated.uid).not.toBe(first.uid);
    });

    it("keeps the email link intact when a repeat sign-in reports the same email in different letter-casing", async () => {
      const repository = createRepository();

      const first = await repository.upsertDiscordIdentity(
        buildDiscordCredential({ id: "discord-1" }),
        "Person@Example.com",
        true,
      );

      // Same Discord account, same address, but the provider reports it
      // with different letter-casing this time - not a real email change.
      // The stale-link cleanup this exercises deliberately compares emails
      // in a case-insensitive way for this exact reason: identityLinks/
      // email:* keys are always lowercased, so "Person@Example.com" and
      // "person@example.com" resolve to the SAME index doc - a raw string
      // comparison would wrongly treat this as an email change and delete
      // that doc with nothing left to replace it.
      const second = await repository.upsertDiscordIdentity(
        buildDiscordCredential({ id: "discord-1" }),
        "person@example.com",
        true,
      );

      expect(second.uid).toBe(first.uid);

      // The email link must still resolve onto this account.
      const linked = await repository.upsertGoogleIdentity(
        buildGoogleCredential({ id: "google-1" }),
        "PERSON@EXAMPLE.COM",
        true,
      );

      expect(linked.uid).toBe(first.uid);
    });

    it("does not let a repeat sign-in claim a verified email a different account already owns", async () => {
      const repository = createRepository();

      const owner = await repository.upsertDiscordIdentity(
        buildDiscordCredential({ id: "discord-owner" }),
        "shared@example.com",
        true,
      );

      const other = await repository.upsertGoogleIdentity(
        buildGoogleCredential({ id: "google-other" }),
        "other@example.com",
        true,
      );

      // The Google account signs in again (a repeat sign-in - it already
      // has a direct link, so this resolves to the SAME uid rather than
      // auto-linking by email), but this time Google reports the email
      // "discord-owner" already verified-and-claimed - e.g. the person
      // changed their Google account's email to match. This must not
      // silently overwrite this account's own stored email to a value it
      // has no actual identityLinks claim on.
      const conflicted = await repository.upsertGoogleIdentity(
        buildGoogleCredential({ id: "google-other" }),
        "shared@example.com",
        true,
      );

      expect(conflicted.uid).toBe(other.uid);
      expect(conflicted.email).toBe("other@example.com");

      // The email link itself must still resolve to its real owner - proof
      // the index was never touched by the conflicting claim above.
      const thirdSignIn = await repository.upsertTwitchIdentity(
        buildTwitchCredential({ id: "twitch-third" }),
        "shared@example.com",
        true,
      );

      expect(thirdSignIn.uid).toBe(owner.uid);
    });

    it("creates a new identity (random uid) for a first-time Google sign-in", async () => {
      const repository = createRepository();

      const credential = buildGoogleCredential({ id: "google-1" });

      const identity = await repository.upsertGoogleIdentity(
        credential,
        credential.email,
        true,
      );

      expect(identity).toEqual({
        uid: identity.uid,
        email: credential.email,
        emailVerified: true,
        google: credential,
      });
      await expect(repository.getIdentity(identity.uid)).resolves.toEqual(
        identity,
      );
    });

    it("resolves to the same uid on a repeat Google sign-in", async () => {
      const repository = createRepository();

      const first = await repository.upsertGoogleIdentity(
        buildGoogleCredential({ id: "google-1", name: "old-name" }),
        "person@example.com",
        true,
      );

      const second = await repository.upsertGoogleIdentity(
        buildGoogleCredential({ id: "google-1", name: "new-name" }),
        "person@example.com",
        true,
      );

      expect(second.uid).toBe(first.uid);
      expect(second.google?.name).toBe("new-name");
    });

    it("links a new Google sign-in onto an existing identity with the same verified email", async () => {
      const repository = createRepository();

      repository.seed(
        buildIdentity({
          uid: "existing-uid",
          email: "person@example.com",
          emailVerified: true,
          discord: buildDiscordCredential({ id: "existing-uid" }),
        }),
      );

      const identity = await repository.upsertGoogleIdentity(
        buildGoogleCredential({ id: "google-2" }),
        "person@example.com",
        true,
      );

      expect(identity.uid).toBe("existing-uid");
      // The pre-existing Discord link must survive the merge, not just the
      // newly-attached Google credential.
      expect(identity.discord?.id).toBe("existing-uid");
    });

    it("does not link by email for Google when the provider hasn't verified it", async () => {
      const repository = createRepository();

      repository.seed(
        buildIdentity({
          uid: "existing-uid",
          email: "person@example.com",
          emailVerified: true,
          discord: undefined,
        }),
      );

      const identity = await repository.upsertGoogleIdentity(
        buildGoogleCredential({ id: "google-3" }),
        "person@example.com",
        false,
      );

      expect(identity.uid).not.toBe("existing-uid");
    });

    it("creates a new identity (random uid) for a first-time Twitch sign-in", async () => {
      const repository = createRepository();

      const credential = buildTwitchCredential({ id: "twitch-1" });

      const identity = await repository.upsertTwitchIdentity(
        credential,
        "person@example.com",
        true,
      );

      expect(identity).toEqual({
        uid: identity.uid,
        email: "person@example.com",
        emailVerified: true,
        twitch: credential,
      });
      await expect(repository.getIdentity(identity.uid)).resolves.toEqual(
        identity,
      );
    });

    it("creates a new Twitch identity with no email when Twitch doesn't provide one", async () => {
      const repository = createRepository();

      const credential = buildTwitchCredential({ id: "twitch-1" });

      const identity = await repository.upsertTwitchIdentity(
        credential,
        null,
        false,
      );

      expect(identity.email).toBeNull();
      expect(identity.emailVerified).toBe(false);
      expect(identity.twitch).toEqual(credential);
    });

    it("resolves to the same uid on a repeat Twitch sign-in", async () => {
      const repository = createRepository();

      const first = await repository.upsertTwitchIdentity(
        buildTwitchCredential({ id: "twitch-1", displayName: "old-name" }),
        null,
        false,
      );

      const second = await repository.upsertTwitchIdentity(
        buildTwitchCredential({ id: "twitch-1", displayName: "new-name" }),
        null,
        false,
      );

      expect(second.uid).toBe(first.uid);
      expect(second.twitch?.displayName).toBe("new-name");
    });

    it("links a new Twitch sign-in onto an existing identity with the same verified email", async () => {
      const repository = createRepository();

      repository.seed(
        buildIdentity({
          uid: "existing-uid",
          email: "person@example.com",
          emailVerified: true,
          discord: buildDiscordCredential({ id: "existing-uid" }),
        }),
      );

      const identity = await repository.upsertTwitchIdentity(
        buildTwitchCredential({ id: "twitch-2" }),
        "person@example.com",
        true,
      );

      expect(identity.uid).toBe("existing-uid");
      // The pre-existing Discord link must survive the merge, not just the
      // newly-attached Twitch credential.
      expect(identity.discord?.id).toBe("existing-uid");
    });

    it("does not link by email for Twitch when the account hasn't verified it", async () => {
      const repository = createRepository();

      repository.seed(
        buildIdentity({
          uid: "existing-uid",
          email: "person@example.com",
          emailVerified: true,
          discord: undefined,
        }),
      );

      const identity = await repository.upsertTwitchIdentity(
        buildTwitchCredential({ id: "twitch-3" }),
        "person@example.com",
        false,
      );

      expect(identity.uid).not.toBe("existing-uid");
    });

    it("links Discord onto the given uid, regardless of email match", async () => {
      const repository = createRepository();

      repository.seed(
        buildIdentity({
          uid: "existing-uid",
          email: "google-email@example.com",
          emailVerified: true,
          discord: undefined,
          google: buildGoogleCredential({ id: "google-1" }),
        }),
      );

      const credential = buildDiscordCredential({ id: "discord-1" });

      const identity = await repository.linkDiscordIdentity(
        "existing-uid",
        credential,
        "discord-email@example.com",
        true,
      );

      expect(identity.uid).toBe("existing-uid");
      expect(identity.discord).toEqual(credential);
      // The account's own email/other linked providers must survive - this
      // is an addition, not a replacement of the account's identity. The
      // Discord profile's own (different) email must NOT overwrite it.
      expect(identity.email).toBe("google-email@example.com");
      expect(identity.google?.id).toBe("google-1");

      // The direct link is now in place for a future plain Discord sign-in.
      await expect(
        repository.upsertDiscordIdentity(credential, null, false),
      ).resolves.toMatchObject({ uid: "existing-uid" });
    });

    it("backfills the account's email from Discord only when it doesn't already have one", async () => {
      const repository = createRepository();

      repository.seed(
        buildIdentity({
          uid: "existing-uid",
          email: null,
          emailVerified: false,
          discord: undefined,
        }),
      );

      const identity = await repository.linkDiscordIdentity(
        "existing-uid",
        buildDiscordCredential({ id: "discord-1" }),
        "discord-email@example.com",
        true,
      );

      expect(identity.email).toBe("discord-email@example.com");
      expect(identity.emailVerified).toBe(true);
    });

    it("rejects linking a Discord account already linked to a different account", async () => {
      const repository = createRepository();

      repository.seed(
        buildIdentity({ uid: "uid-1", discord: buildDiscordCredential({ id: "discord-1" }) }),
      );
      repository.seed(
        buildIdentity({ uid: "uid-2", email: null, discord: undefined }),
      );

      await expect(
        repository.linkDiscordIdentity(
          "uid-2",
          buildDiscordCredential({ id: "discord-1" }),
          null,
          false,
        ),
      ).rejects.toThrow();

      // The first account's link must be untouched by the rejected attempt.
      await expect(repository.getIdentity("uid-1")).resolves.toMatchObject({
        discord: { id: "discord-1" },
      });
    });

    it("rejects linking Discord onto an unknown uid", async () => {
      const repository = createRepository();

      await expect(
        repository.linkDiscordIdentity(
          "missing",
          buildDiscordCredential({ id: "discord-1" }),
          null,
          false,
        ),
      ).rejects.toThrow(IdentityNotFoundError);
    });

    it("allows re-linking the same Discord account onto the same uid", async () => {
      const repository = createRepository();

      repository.seed(
        buildIdentity({
          uid: "existing-uid",
          discord: buildDiscordCredential({ id: "discord-1", username: "old-name" }),
        }),
      );

      const identity = await repository.linkDiscordIdentity(
        "existing-uid",
        buildDiscordCredential({ id: "discord-1", username: "new-name" }),
        null,
        false,
      );

      expect(identity.discord?.username).toBe("new-name");
    });

    it("releases the old Discord account's link when re-linking to a different Discord account", async () => {
      const repository = createRepository();

      repository.seed(
        buildIdentity({
          uid: "existing-uid",
          discord: buildDiscordCredential({ id: "discord-old" }),
        }),
      );

      const newCredential = buildDiscordCredential({ id: "discord-new" });

      await repository.linkDiscordIdentity(
        "existing-uid",
        newCredential,
        null,
        false,
      );

      // The new Discord account resolves to this uid...
      await expect(
        repository.getIdentityByDiscordUid("discord-new"),
      ).resolves.toMatchObject({ uid: "existing-uid" });

      // ...and the old one no longer does - left pointing here, a later
      // plain sign-in via the old Discord account would silently resolve
      // back onto this uid, reverting the user's chosen re-link.
      await expect(
        repository.getIdentityByDiscordUid("discord-old"),
      ).resolves.toBeNull();

      // Confirmed by actually exercising the old account through a plain
      // sign-in: it must mint a fresh identity, not resolve onto the
      // account it used to be linked to.
      const oldCredential = buildDiscordCredential({ id: "discord-old" });

      await expect(
        repository.upsertDiscordIdentity(oldCredential, null, false),
      ).resolves.toMatchObject({ uid: "discord-old" });
    });

    it("updates only the given Discord credential fields, preserving the rest", async () => {
      const repository = createRepository();

      const identity = buildIdentity({
        uid: "user-1",
        discord: buildDiscordCredential({
          id: "user-1",
          username: "original-name",
          accessToken: "old-access-token",
        }),
      });

      repository.seed(identity);

      await repository.updateDiscordCredential("user-1", {
        accessToken: "new-access-token",
        fetchTime: 1_700_000_000_001,
      });

      await expect(repository.getIdentity("user-1")).resolves.toMatchObject({
        discord: {
          username: "original-name",
          accessToken: "new-access-token",
          fetchTime: 1_700_000_000_001,
        },
      });
    });

    it("rejects updating the Discord credential for an unknown uid", async () => {
      const repository = createRepository();

      await expect(
        repository.updateDiscordCredential("missing", {
          accessToken: "token",
        }),
      ).rejects.toThrow(IdentityNotFoundError);
    });

    it("rejects updating the Discord credential for an identity with none linked", async () => {
      const repository = createRepository();

      repository.seed(
        buildIdentity({ uid: "user-1", discord: undefined }),
      );

      await expect(
        repository.updateDiscordCredential("user-1", {
          accessToken: "token",
        }),
      ).rejects.toThrow(IdentityNotFoundError);
    });

    it("rejects an invalid uid", async () => {
      const repository = createRepository();

      await expect(
        repository.updateDiscordCredential("", { accessToken: "token" }),
      ).rejects.toThrow("Invalid user id");
    });

    it("clear removes every identity", async () => {
      const repository = createRepository();

      repository.seed(buildIdentity());

      repository.clear();

      await expect(
        repository.getIdentity(buildIdentity().uid),
      ).resolves.toBeNull();
    });
  });
}
