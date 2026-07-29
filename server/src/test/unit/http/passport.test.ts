import type { Profile } from "passport-discord";
import type { Profile as GoogleProfile } from "passport-google-oauth20";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionUser } from "../../../modules/auth/domain/Identity.js";
import { env } from "../../../shared/config/env.js";
import { TokenDecryptionError } from "../../../shared/utils/crypto.js";
import { logger } from "../../../shared/logger/logger.js";

import { buildIdentity, buildSessionUser } from "../../builders/auth.js";
import { InMemoryIdentityRepository } from "../../repositories/inMemory/InMemoryIdentityRepository.js";

type SerializeUser = (user: Express.User, done: DoneCallback) => void;
type DeserializeUser = (
  payload: { id: string },
  done: DoneCallback,
) => Promise<void>;
type DoneCallback = (error: unknown, user?: unknown) => void;

type StrategyOptions = {
  clientID: string;
  clientSecret: string;
  callbackURL: string;
};
type FakeRequest = {
  session: { linkDiscordUid?: string; linkDiscordUidExpiresAt?: number };
};
type VerifyCallback = (
  req: FakeRequest,
  accessToken: string,
  refreshToken: string,
  profile: Profile,
  done: DoneCallback,
) => Promise<void>;

const registered: {
  serialize?: SerializeUser;
  deserialize?: DeserializeUser;
  strategies: MockDiscordStrategy[];
  refreshStrategies: unknown[];
} = { strategies: [], refreshStrategies: [] };

class MockDiscordStrategy {
  /**
   * Assigned onto the prototype by configurePassport. Declared (not defined)
   * so the class field does not shadow that prototype assignment.
   */
  declare authorizationParams?: () => { prompt: string };

  constructor(
    readonly options: StrategyOptions,
    readonly verify: VerifyCallback,
  ) {
    registered.strategies.push(this);
  }
}

vi.mock("passport", () => ({
  default: {
    serializeUser: (fn: SerializeUser) => {
      registered.serialize = fn;
    },
    deserializeUser: (fn: DeserializeUser) => {
      registered.deserialize = fn;
    },
    use: vi.fn(),
  },
}));

vi.mock("passport-discord", () => ({
  Strategy: MockDiscordStrategy,
}));

type GoogleStrategyOptions = {
  clientID: string;
  clientSecret: string;
  callbackURL: string;
  scope: string[];
};
type GoogleVerifyCallback = (
  accessToken: string,
  refreshToken: string,
  profile: GoogleProfile,
  done: DoneCallback,
) => void;

const registeredGoogle: { strategies: MockGoogleStrategy[] } = {
  strategies: [],
};

class MockGoogleStrategy {
  constructor(
    readonly options: GoogleStrategyOptions,
    readonly verify: GoogleVerifyCallback,
  ) {
    registeredGoogle.strategies.push(this);
  }
}

vi.mock("passport-google-oauth20", () => ({
  Strategy: MockGoogleStrategy,
}));

type TwitchProfile = {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
  email: string | null;
};
type TwitchStrategyOptions = {
  clientID: string;
  clientSecret: string;
  callbackURL: string;
  scope: string[];
};
type TwitchVerifyCallback = (
  accessToken: string,
  refreshToken: string,
  profile: TwitchProfile,
  done: DoneCallback,
) => void;

const registeredTwitch: { strategies: MockTwitchStrategy[] } = {
  strategies: [],
};

class MockTwitchStrategy {
  constructor(
    readonly options: TwitchStrategyOptions,
    readonly verify: TwitchVerifyCallback,
  ) {
    registeredTwitch.strategies.push(this);
  }
}

vi.mock("../../../http/strategies/TwitchOAuth2Strategy.js", () => ({
  TwitchOAuth2Strategy: MockTwitchStrategy,
}));

vi.mock("passport-oauth2-refresh", () => ({
  default: {
    use: (strategy: unknown) => {
      registered.refreshStrategies.push(strategy);
    },
  },
}));

const { configurePassport } = await import("../../../http/passport.js");

const PROFILE = {
  id: "discord-user-1",
  username: "tester",
  discriminator: "0001",
  avatar: "avatar.png",
} as unknown as Profile;

const GOOGLE_PROFILE = {
  id: "google-user-1",
  displayName: "tester",
  emails: [{ value: "tester@example.com", verified: true }],
  photos: [{ value: "https://example.com/photo.jpg" }],
} as unknown as GoogleProfile;

const TWITCH_PROFILE: TwitchProfile = {
  id: "twitch-user-1",
  login: "tester",
  displayName: "tester",
  profileImageUrl: "https://example.com/photo.jpg",
  email: "tester@example.com",
};

function setup() {
  const repository = new InMemoryIdentityRepository();

  configurePassport(repository);

  const strategy = registered.strategies.at(-1);

  if (!strategy) {
    throw new Error("Discord strategy was not registered");
  }

  return { repository, strategy };
}

function setupGoogle() {
  const repository = new InMemoryIdentityRepository();

  configurePassport(repository);

  const strategy = registeredGoogle.strategies.at(-1);

  if (!strategy) {
    throw new Error("Google strategy was not registered");
  }

  return { repository, strategy };
}

function setupTwitch() {
  const repository = new InMemoryIdentityRepository();

  configurePassport(repository);

  const strategy = registeredTwitch.strategies.at(-1);

  if (!strategy) {
    throw new Error("Twitch strategy was not registered");
  }

  return { repository, strategy };
}

function invoke<T>(run: (done: DoneCallback) => void): Promise<[unknown, T]> {
  return new Promise((resolve) => {
    run((error, user) => resolve([error, user as T]));
  });
}

beforeEach(() => {
  registered.strategies.length = 0;
  registered.refreshStrategies.length = 0;
  registeredGoogle.strategies.length = 0;
  registeredTwitch.strategies.length = 0;
});

afterEach(() => {
  env.isProduction = false;
  vi.restoreAllMocks();
});

describe("configurePassport", () => {
  describe("session serialization", () => {
    it("stores only the user id in the session", async () => {
      setup();

      const [error, sessionUser] = await invoke<{ id: string }>((done) =>
        registered.serialize?.(buildSessionUser({ id: "discord-user-1" }), done),
      );

      expect(error).toBeNull();
      expect(sessionUser).toEqual({ id: "discord-user-1" });
    });

    it("rehydrates the stored identity as a session user, without its OAuth tokens", async () => {
      const { repository } = setup();
      const identity = buildIdentity();

      repository.seed(identity);

      const [error, resolved] = await invoke<SessionUser>((done) => {
        void registered.deserialize?.({ id: identity.uid }, done);
      });

      expect(error).toBeNull();
      expect(resolved).toEqual({
        id: identity.uid,
        email: identity.email,
        emailVerified: identity.emailVerified,
        name: identity.discord?.username,
        avatarUrl: `https://cdn.discordapp.com/avatars/${identity.discord?.id}/${identity.discord?.avatar}.png`,
        providers: ["discord"],
      });
      expect(resolved).not.toHaveProperty("accessToken");
      expect(resolved).not.toHaveProperty("refreshToken");
    });

    it("falls back to the Google name/avatar when there is no Discord credential", async () => {
      const { repository } = setup();
      const identity = buildIdentity({
        uid: "google-user-1",
        discord: undefined,
        google: {
          id: "google-user-1",
          email: "tester@example.com",
          name: "Tester",
          picture: "https://example.com/photo.jpg",
        },
      });

      repository.seed(identity);

      const [error, resolved] = await invoke<SessionUser>((done) => {
        void registered.deserialize?.({ id: identity.uid }, done);
      });

      expect(error).toBeNull();
      expect(resolved).toEqual({
        id: identity.uid,
        email: identity.email,
        emailVerified: identity.emailVerified,
        name: "Tester",
        avatarUrl: "https://example.com/photo.jpg",
        providers: ["google"],
      });
    });

    it("falls back to the Twitch name/avatar when there is no Discord or Google credential", async () => {
      const { repository } = setup();
      const identity = buildIdentity({
        uid: "twitch-user-1",
        discord: undefined,
        twitch: {
          id: "twitch-user-1",
          login: "tester",
          displayName: "Tester",
          profileImageUrl: "https://example.com/photo.jpg",
        },
      });

      repository.seed(identity);

      const [error, resolved] = await invoke<SessionUser>((done) => {
        void registered.deserialize?.({ id: identity.uid }, done);
      });

      expect(error).toBeNull();
      expect(resolved).toEqual({
        id: identity.uid,
        email: identity.email,
        emailVerified: identity.emailVerified,
        name: "Tester",
        avatarUrl: "https://example.com/photo.jpg",
        providers: ["twitch"],
      });
    });

    it("resolves to null for an unknown session user", async () => {
      setup();

      const [error, resolved] = await invoke((done) => {
        void registered.deserialize?.({ id: "ghost" }, done);
      });

      expect(error).toBeNull();
      expect(resolved).toBeNull();
    });

    it("reports a repository failure to passport", async () => {
      const { repository } = setup();

      vi.spyOn(repository, "getIdentity").mockRejectedValue(
        new Error("firestore unavailable"),
      );

      const [error, resolved] = await invoke((done) => {
        void registered.deserialize?.({ id: "user-1" }, done);
      });

      expect(error).toBeInstanceOf(Error);
      expect(resolved).toBeNull();
    });

    it("logs the session out instead of erroring when stored tokens can't be decrypted", async () => {
      const { repository } = setup();
      const warn = vi.spyOn(logger, "warn").mockReturnValue();

      vi.spyOn(repository, "getIdentity").mockRejectedValue(
        new TokenDecryptionError(new Error("bad auth tag")),
      );

      const [error, resolved] = await invoke((done) => {
        void registered.deserialize?.({ id: "user-1" }, done);
      });

      // done(null, false) - not an error - is Passport's convention for
      // "treat this session as unauthenticated", as opposed to done(error)
      // which would surface as a 500 on every request using this session.
      expect(error).toBeNull();
      expect(resolved).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        {
          userId: "user-1",
          error: expect.any(TokenDecryptionError) as TokenDecryptionError,
        },
        "Failed to decrypt stored tokens for session user; logging out",
      );
    });
  });

  describe("discord strategy", () => {
    it("registers the strategy with the refresh helper", () => {
      const { strategy } = setup();

      expect(registered.refreshStrategies).toEqual([strategy]);
    });

    it("requests the identify and email scopes", () => {
      const { strategy } = setup();

      expect(
        (strategy.options as unknown as { scope: string[] }).scope,
      ).toEqual(["identify", "email"]);
    });

    it("uses the local callback url outside production", () => {
      const { strategy } = setup();

      expect(strategy.options).toMatchObject({
        clientID: "discord-client-id",
        clientSecret: "discord-client-secret",
        callbackURL: "http://localhost:3000/api/auth/discord/callback",
      });
    });

    it("uses the public callback url in production", () => {
      env.isProduction = true;

      const { strategy } = setup();

      expect(strategy.options.callbackURL).toBe(
        `${env.serverUrl}/api/auth/discord/callback`,
      );
    });

    it("suppresses the Discord consent prompt", () => {
      const { strategy } = setup();

      expect(strategy.authorizationParams?.()).toEqual({ prompt: "none" });
    });

    it("persists the tokens to the repository but keeps them off req.user", async () => {
      const { repository, strategy } = setup();

      const [error, user] = await invoke<SessionUser>((done) => {
        void strategy.verify(
          { session: {} },
          "access-token",
          "refresh-token",
          PROFILE,
          done,
        );
      });

      expect(error).toBeNull();
      expect(user).toMatchObject({
        id: "discord-user-1",
        name: "tester",
      });
      expect(user).not.toHaveProperty("accessToken");
      expect(user).not.toHaveProperty("refreshToken");

      // The tokens are still written to storage - only the session-attached
      // req.user object omits them.
      await expect(
        repository.getIdentity("discord-user-1"),
      ).resolves.toMatchObject({
        discord: {
          username: "tester",
          avatar: "avatar.png",
          accessToken: "access-token",
        },
      });
    });

    it("defaults a missing avatar to an empty string", async () => {
      const { repository, strategy } = setup();

      await invoke((done) => {
        void strategy.verify(
          { session: {} },
          "access-token",
          "refresh-token",
          { ...PROFILE, avatar: undefined } as unknown as Profile,
          done,
        );
      });

      await expect(
        repository.getIdentity("discord-user-1"),
      ).resolves.toMatchObject({ discord: { avatar: "" } });
    });

    it("reports a persistence failure to passport", async () => {
      const { repository, strategy } = setup();

      vi.spyOn(repository, "upsertDiscordIdentity").mockRejectedValue(
        new Error("firestore unavailable"),
      );

      const [error] = await invoke((done) => {
        void strategy.verify(
          { session: {} },
          "access-token",
          "refresh-token",
          PROFILE,
          done,
        );
      });

      expect(error).toBeInstanceOf(Error);
    });

    it("links onto the session's uid instead of upserting by email, when linkDiscordUid is set", async () => {
      const { repository, strategy } = setup();

      repository.seed(
        buildIdentity({
          uid: "existing-uid",
          email: "google-email@example.com",
          emailVerified: true,
          discord: undefined,
        }),
      );

      const req: FakeRequest = {
        session: {
          linkDiscordUid: "existing-uid",
          linkDiscordUidExpiresAt: Date.now() + 60_000,
        },
      };

      const [error, user] = await invoke<SessionUser>((done) => {
        void strategy.verify(req, "access-token", "refresh-token", PROFILE, done);
      });

      expect(error).toBeNull();
      expect(user).toMatchObject({ id: "existing-uid" });
      // The account's own email must survive - the linked Discord profile's
      // email/verification never touches it, unlike upsertDiscordIdentity's
      // login-time behavior.
      await expect(
        repository.getIdentity("existing-uid"),
      ).resolves.toMatchObject({
        email: "google-email@example.com",
        discord: { id: "discord-user-1" },
      });
    });

    it("clears linkDiscordUid and its expiry from the session after consuming it", async () => {
      const { repository, strategy } = setup();

      repository.seed(buildIdentity({ uid: "existing-uid", discord: undefined }));

      const req: FakeRequest = {
        session: {
          linkDiscordUid: "existing-uid",
          linkDiscordUidExpiresAt: Date.now() + 60_000,
        },
      };

      await invoke((done) => {
        void strategy.verify(req, "access-token", "refresh-token", PROFILE, done);
      });

      expect(req.session.linkDiscordUid).toBeUndefined();
      expect(req.session.linkDiscordUidExpiresAt).toBeUndefined();
    });

    it("falls back to a normal login instead of linking once the intent has expired", async () => {
      const { repository, strategy } = setup();

      // An abandoned "Connect Discord" round trip: the uid was stashed but
      // its TTL has already passed, so this must NOT be treated as a link -
      // otherwise a stale flag from a closed tab would silently hijack a
      // later, unrelated Discord login in the same browser session.
      repository.seed(
        buildIdentity({ uid: "existing-uid", discord: undefined }),
      );

      const req: FakeRequest = {
        session: {
          linkDiscordUid: "existing-uid",
          linkDiscordUidExpiresAt: Date.now() - 1,
        },
      };

      const [error, user] = await invoke<SessionUser>((done) => {
        void strategy.verify(req, "access-token", "refresh-token", PROFILE, done);
      });

      expect(error).toBeNull();
      // Falls through to upsertDiscordIdentity, which mints its own uid
      // (equal to the Discord profile id) rather than linking onto
      // "existing-uid".
      expect(user).toMatchObject({ id: "discord-user-1" });
      expect(req.session.linkDiscordUid).toBeUndefined();
      expect(req.session.linkDiscordUidExpiresAt).toBeUndefined();
    });

    it("reports a linking conflict to passport", async () => {
      const { repository, strategy } = setup();

      repository.seed(buildIdentity({ uid: "existing-uid", discord: undefined }));

      vi.spyOn(repository, "linkDiscordIdentity").mockRejectedValue(
        new Error("already linked to a different account"),
      );

      const req: FakeRequest = {
        session: {
          linkDiscordUid: "existing-uid",
          linkDiscordUidExpiresAt: Date.now() + 60_000,
        },
      };

      const [error] = await invoke((done) => {
        void strategy.verify(req, "access-token", "refresh-token", PROFILE, done);
      });

      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("google strategy", () => {
    it("registers the strategy when Google credentials are configured", () => {
      const { strategy } = setupGoogle();

      expect(strategy).toBeDefined();
    });

    it("requests the email and profile scopes", () => {
      const { strategy } = setupGoogle();

      expect(strategy.options.scope).toEqual(["email", "profile"]);
    });

    it("uses the local callback url outside production", () => {
      const { strategy } = setupGoogle();

      expect(strategy.options).toMatchObject({
        clientID: "google-client-id",
        clientSecret: "google-client-secret",
        callbackURL: "http://localhost:3000/api/auth/google/callback",
      });
    });

    it("uses the public callback url in production", () => {
      env.isProduction = true;

      const { strategy } = setupGoogle();

      expect(strategy.options.callbackURL).toBe(
        `${env.serverUrl}/api/auth/google/callback`,
      );
    });

    it("persists the profile to the repository and returns a session user", async () => {
      const { repository, strategy } = setupGoogle();

      const [error, user] = await invoke<SessionUser>((done) => {
        strategy.verify(
          "access-token",
          "refresh-token",
          GOOGLE_PROFILE,
          done,
        );
      });

      expect(error).toBeNull();
      // A brand new Google signup mints a fresh random uid rather than
      // reusing the Google profile id (unlike Discord, there's no legacy
      // data keyed by it to stay compatible with).
      expect(user?.id).toEqual(expect.any(String));
      expect(user).toMatchObject({
        name: "tester",
        email: "tester@example.com",
        emailVerified: true,
      });

      await expect(
        repository.getIdentity(user?.id ?? ""),
      ).resolves.toMatchObject({
        google: {
          id: "google-user-1",
          email: "tester@example.com",
          name: "tester",
        },
      });
    });

    it("rejects a profile with no email", async () => {
      const { strategy } = setupGoogle();

      const [error] = await invoke((done) => {
        strategy.verify(
          "access-token",
          "refresh-token",
          { ...GOOGLE_PROFILE, emails: [] },
          done,
        );
      });

      expect(error).toBeInstanceOf(Error);
    });

    it("reports a persistence failure to passport", async () => {
      const { repository, strategy } = setupGoogle();

      vi.spyOn(repository, "upsertGoogleIdentity").mockRejectedValue(
        new Error("firestore unavailable"),
      );

      const [error] = await invoke((done) => {
        strategy.verify(
          "access-token",
          "refresh-token",
          GOOGLE_PROFILE,
          done,
        );
      });

      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("twitch strategy", () => {
    it("registers the strategy when Twitch login is enabled", () => {
      const { strategy } = setupTwitch();

      expect(strategy).toBeDefined();
    });

    it("requests the user:read:email scope", () => {
      const { strategy } = setupTwitch();

      expect(strategy.options.scope).toEqual(["user:read:email"]);
    });

    it("uses the local callback url outside production", () => {
      const { strategy } = setupTwitch();

      expect(strategy.options).toMatchObject({
        clientID: "twitch-client-id",
        clientSecret: "twitch-client-secret",
        callbackURL: "http://localhost:3000/api/auth/twitch/callback",
      });
    });

    it("uses the public callback url in production", () => {
      env.isProduction = true;

      const { strategy } = setupTwitch();

      expect(strategy.options.callbackURL).toBe(
        `${env.serverUrl}/api/auth/twitch/callback`,
      );
    });

    it("persists the profile to the repository and returns a session user", async () => {
      const { repository, strategy } = setupTwitch();

      const [error, user] = await invoke<SessionUser>((done) => {
        strategy.verify(
          "access-token",
          "refresh-token",
          TWITCH_PROFILE,
          done,
        );
      });

      expect(error).toBeNull();
      // A brand new Twitch signup mints a fresh random uid rather than
      // reusing the Twitch profile id, same rationale as Google.
      expect(user?.id).toEqual(expect.any(String));
      expect(user).toMatchObject({
        name: "tester",
        email: "tester@example.com",
        emailVerified: true,
      });

      await expect(
        repository.getIdentity(user?.id ?? ""),
      ).resolves.toMatchObject({
        twitch: {
          id: "twitch-user-1",
          login: "tester",
          displayName: "tester",
        },
      });
    });

    it("creates an identity with no email when Twitch doesn't provide one", async () => {
      const { repository, strategy } = setupTwitch();

      const [error, user] = await invoke<SessionUser>((done) => {
        strategy.verify(
          "access-token",
          "refresh-token",
          { ...TWITCH_PROFILE, email: null },
          done,
        );
      });

      expect(error).toBeNull();
      await expect(
        repository.getIdentity(user?.id ?? ""),
      ).resolves.toMatchObject({ email: null, emailVerified: false });
    });

    it("reports a persistence failure to passport", async () => {
      const { repository, strategy } = setupTwitch();

      vi.spyOn(repository, "upsertTwitchIdentity").mockRejectedValue(
        new Error("firestore unavailable"),
      );

      const [error] = await invoke((done) => {
        strategy.verify(
          "access-token",
          "refresh-token",
          TWITCH_PROFILE,
          done,
        );
      });

      expect(error).toBeInstanceOf(Error);
    });
  });
});
