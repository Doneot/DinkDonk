import { describe, expect, it } from "vitest";

import { FirestoreIdentityRepository } from "../../../modules/auth/infrastructure/firestore/FirestoreIdentityRepository.js";
import type { Identity } from "../../../modules/auth/domain/Identity.js";

import { identityRepositoryBehavior } from "../contracts/IdentityRepository.behavior.js";
import { buildDiscordCredential } from "../../builders/auth.js";
import { FakeFirestore } from "../../helpers/fakeFirestore.js";

identityRepositoryBehavior("FirestoreIdentityRepository", () => {
  const firestore = new FakeFirestore();
  const repository = new FirestoreIdentityRepository(firestore.asFirestore());

  return Object.assign(repository, {
    seed(identity: Identity): void {
      const { uid, ...record } = identity;

      firestore.write(`identities/${uid}`, record);

      if (identity.discord) {
        firestore.write(`identityLinks/discord:${identity.discord.id}`, {
          uid,
        });
      }

      if (identity.google) {
        firestore.write(`identityLinks/google:${identity.google.id}`, {
          uid,
        });
      }

      if (identity.twitch) {
        firestore.write(`identityLinks/twitch:${identity.twitch.id}`, {
          uid,
        });
      }

      if (identity.email && identity.emailVerified) {
        firestore.write(
          `identityLinks/email:${identity.email.toLowerCase()}`,
          { uid },
        );
      }
    },

    clear(): void {
      for (const path of firestore.paths("identities")) {
        firestore.remove(path);
      }

      for (const path of firestore.paths("identityLinks")) {
        firestore.remove(path);
      }
    },
  });
});

const DISCORD_RECORD = {
  id: "discord-1",
  username: "tester",
  discriminator: "0001",
  avatar: "avatar.png",
  accessToken: "access-token",
  refreshToken: "refresh-token",
  fetchTime: 1_700_000_000_000,
};

function setup() {
  const firestore = new FakeFirestore();

  return {
    firestore,
    repository: new FirestoreIdentityRepository(firestore.asFirestore()),
  };
}

describe("FirestoreIdentityRepository", () => {
  describe("getIdentity", () => {
    it("returns null for a document that does not exist", async () => {
      const { repository } = setup();

      await expect(repository.getIdentity("user-1")).resolves.toBeNull();
    });

    it("maps a stored record onto the domain identity", async () => {
      const { firestore, repository } = setup();

      firestore.write("identities/user-1", {
        email: "person@example.com",
        emailVerified: true,
        discord: DISCORD_RECORD,
      });

      await expect(repository.getIdentity("user-1")).resolves.toEqual({
        uid: "user-1",
        email: "person@example.com",
        emailVerified: true,
        discord: DISCORD_RECORD,
      });
    });

    it("defaults email/emailVerified when absent", async () => {
      const { firestore, repository } = setup();

      firestore.write("identities/user-1", { discord: DISCORD_RECORD });

      await expect(repository.getIdentity("user-1")).resolves.toMatchObject({
        email: null,
        emailVerified: false,
      });
    });

    it("rejects a malformed Discord credential", async () => {
      const { firestore, repository } = setup();

      firestore.write("identities/user-1", {
        discord: { ...DISCORD_RECORD, accessToken: "" },
      });

      await expect(repository.getIdentity("user-1")).rejects.toThrow();
    });
  });

  describe("upsertDiscordIdentity", () => {
    it("encrypts the Discord tokens at rest", async () => {
      const { firestore, repository } = setup();

      await repository.upsertDiscordIdentity(
        buildDiscordCredential({ id: "discord-1" }),
        null,
        false,
      );

      const stored = firestore.read("identities/discord-1") as Record<
        string,
        unknown
      >;
      const discord = stored.discord as Record<string, unknown>;

      expect(discord.accessToken).not.toBe("access-token");
      expect(discord.accessToken).toMatch(/^enc:v1:/);
    });

    it("creates the discord: index doc for future lookups", async () => {
      const { firestore, repository } = setup();

      await repository.upsertDiscordIdentity(
        buildDiscordCredential({ id: "discord-1" }),
        null,
        false,
      );

      expect(firestore.read("identityLinks/discord:discord-1")).toEqual({
        uid: "discord-1",
      });
    });

    it("creates the email: index doc when the email is verified", async () => {
      const { firestore, repository } = setup();

      await repository.upsertDiscordIdentity(
        buildDiscordCredential({ id: "discord-1" }),
        "Person@Example.com",
        true,
      );

      expect(
        firestore.read("identityLinks/email:person@example.com"),
      ).toEqual({ uid: "discord-1" });
    });
  });

  describe("updateDiscordCredential", () => {
    it("re-encrypts a rotated access token", async () => {
      const { firestore, repository } = setup();

      firestore.write("identities/user-1", {
        email: null,
        emailVerified: false,
        discord: DISCORD_RECORD,
      });

      await repository.updateDiscordCredential("user-1", {
        accessToken: "rotated",
        fetchTime: 1_700_000_000_001,
      });

      const stored = firestore.read("identities/user-1") as Record<
        string,
        unknown
      >;
      const discord = stored.discord as Record<string, unknown>;

      expect(discord.username).toBe("tester");
      expect(discord.accessToken).not.toBe("rotated");
      expect(discord.accessToken).toMatch(/^enc:v1:/);

      await expect(repository.getIdentity("user-1")).resolves.toMatchObject({
        discord: { accessToken: "rotated", fetchTime: 1_700_000_000_001 },
      });
    });

    it.each(["", "   "])("rejects the blank uid %j", async (uid) => {
      const { repository } = setup();

      await expect(
        repository.updateDiscordCredential(uid, { accessToken: "token" }),
      ).rejects.toThrow("Invalid user id");
    });
  });
});
