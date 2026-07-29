import type { Profile } from "passport-discord";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthUser } from "../../../modules/auth/domain/AuthUser.js";
import { env } from "../../../shared/config/env.js";
import { TokenDecryptionError } from "../../../shared/utils/crypto.js";
import { logger } from "../../../shared/logger/logger.js";

import { buildAuthUser } from "../../builders/auth.js";
import { InMemoryAuthUserRepository } from "../../repositories/inMemory/InMemoryAuthUserRepository.js";

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
type VerifyCallback = (
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

function setup() {
  const repository = new InMemoryAuthUserRepository();

  configurePassport(repository);

  const strategy = registered.strategies.at(-1);

  if (!strategy) {
    throw new Error("Discord strategy was not registered");
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
        registered.serialize?.(buildAuthUser(), done),
      );

      expect(error).toBeNull();
      expect(sessionUser).toEqual({ id: "discord-user-1" });
    });

    it("rehydrates the stored auth user, without its OAuth tokens", async () => {
      const { repository } = setup();
      const user = buildAuthUser();

      repository.seed(user);

      const [error, resolved] = await invoke<AuthUser>((done) => {
        void registered.deserialize?.({ id: user.id }, done);
      });

      expect(error).toBeNull();
      expect(resolved).toEqual({
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        fetchTime: user.fetchTime,
      });
      expect(resolved).not.toHaveProperty("accessToken");
      expect(resolved).not.toHaveProperty("refreshToken");
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

      vi.spyOn(repository, "getAuthUser").mockRejectedValue(
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

      vi.spyOn(repository, "getAuthUser").mockRejectedValue(
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

      const [error, user] = await invoke<AuthUser>((done) => {
        void strategy.verify("access-token", "refresh-token", PROFILE, done);
      });

      expect(error).toBeNull();
      expect(user).toMatchObject({
        id: "discord-user-1",
        username: "tester",
      });
      expect(user).not.toHaveProperty("accessToken");
      expect(user).not.toHaveProperty("refreshToken");

      // The tokens are still written to storage - only the session-attached
      // req.user object omits them.
      await expect(
        repository.getAuthUser("discord-user-1"),
      ).resolves.toMatchObject({
        username: "tester",
        avatar: "avatar.png",
        accessToken: "access-token",
      });
    });

    it("defaults a missing avatar to an empty string", async () => {
      const { repository, strategy } = setup();

      await invoke((done) => {
        void strategy.verify(
          "access-token",
          "refresh-token",
          { ...PROFILE, avatar: undefined } as unknown as Profile,
          done,
        );
      });

      await expect(
        repository.getAuthUser("discord-user-1"),
      ).resolves.toMatchObject({ avatar: "" });
    });

    it("reports a persistence failure to passport", async () => {
      const { repository, strategy } = setup();

      vi.spyOn(repository, "updateAuthUser").mockRejectedValue(
        new Error("firestore unavailable"),
      );

      const [error] = await invoke((done) => {
        void strategy.verify("access-token", "refresh-token", PROFILE, done);
      });

      expect(error).toBeInstanceOf(Error);
    });
  });
});
