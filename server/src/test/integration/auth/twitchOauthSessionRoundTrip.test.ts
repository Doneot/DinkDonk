import express from "express";
import session from "express-session";
import type { StrategyOptions } from "passport-oauth2";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { userResponseSchema } from "../../../http/schemas/responses.js";
import type { TwitchProfile } from "../../../http/strategies/TwitchOAuth2Strategy.js";
import type { DiscordService } from "../../../modules/discord/ports/DiscordService.js";
import { InMemoryUserRepository } from "../../repositories/inMemory/InMemoryUserRepository.js";

type VerifyDone = (error: unknown, user?: unknown) => void;
type Verify = (
  accessToken: string,
  refreshToken: string,
  profile: TwitchProfile,
  done: VerifyDone,
) => void;

const PROFILE: TwitchProfile = {
  id: "twitch-user-1",
  login: "tester",
  displayName: "tester",
  profileImageUrl: "https://example.com/photo.jpg",
  email: "tester@example.com",
};

/**
 * Mirrors googleOauthSessionRoundTrip.test.ts's FakeGoogleStrategy, but mocks
 * our own TwitchOAuth2Strategy module directly rather than a third-party
 * package - simpler than intercepting the generic passport-oauth2 base class
 * that TwitchOAuth2Strategy itself subclasses.
 */
class FakeTwitchStrategy {
  name = "twitch";

  success!: (user: unknown) => void;
  fail!: () => void;
  error!: (err: unknown) => void;

  constructor(
    _options: StrategyOptions,
    private readonly verify: Verify,
  ) {}

  authenticate(): void {
    this.verify("access-token", "refresh-token", PROFILE, (error, user) => {
      if (error) {
        this.error(error);
        return;
      }

      if (!user) {
        this.fail();
        return;
      }

      this.success(user);
    });
  }
}

vi.mock("../../../http/strategies/TwitchOAuth2Strategy.js", () => ({
  TwitchOAuth2Strategy: FakeTwitchStrategy,
}));

vi.mock("passport-oauth2-refresh", () => ({
  default: { use: () => {} },
}));

const passportModule = await import("passport");
const { configurePassport } = await import("../../../http/passport.js");
const { createAuthRouter } = await import("../../../http/routes/authRoutes.js");
const { errorHandler } = await import("../../../http/middleware/errorHandler.js");
const { InMemoryIdentityRepository } = await import(
  "../../repositories/inMemory/InMemoryIdentityRepository.js"
);

const passport = passportModule.default;

// See googleOauthSessionRoundTrip.test.ts for why one app/passport config is
// shared across every test here (repositories reset in beforeEach instead)
// rather than a fresh createApp() per test.
const identityRepository = new InMemoryIdentityRepository();
const userRepository = new InMemoryUserRepository();

configurePassport(identityRepository);

const app = express();

app.use(
  session({
    secret: "test-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

const discord: DiscordService = {
  isReady: true,
  canSendDirectMessage: () => Promise.resolve(true),
};

app.use(
  "/api/auth",
  createAuthRouter({
    repository: userRepository,
    identities: identityRepository,
    discord,
    ensureFreshToken: (_req, _res, next) => next(),
  }),
);

app.use(errorHandler);

beforeEach(() => {
  identityRepository.clear();
  userRepository.clear();
});

describe("Twitch OAuth + session round trip (real passport, real express-session)", () => {
  it("keeps the user authenticated on the request immediately after login", async () => {
    const agent = request.agent(app);

    await agent.get("/api/auth/twitch/callback").expect(302);

    const response = await agent.get("/api/auth/user").expect(200);

    expect(userResponseSchema.parse(response.body)).toMatchObject({
      name: "tester",
      email: "tester@example.com",
      emailVerified: true,
      providers: ["twitch"],
    });
  });

  it("persists the authenticated user across more than one subsequent request", async () => {
    const agent = request.agent(app);

    await agent.get("/api/auth/twitch/callback").expect(302);

    await agent.get("/api/auth/user").expect(200);
    await agent.get("/api/auth/user").expect(200);
  });

  it("links onto an existing Discord-created account with the same verified email", async () => {
    const agent = request.agent(app);

    // A pre-existing Discord signup on the same verified email that Twitch
    // will report - this is the account-linking-by-verified-email path.
    await identityRepository.upsertDiscordIdentity(
      {
        id: "discord-user-1",
        username: "discord-name",
        discriminator: "0001",
        avatar: "avatar.png",
        accessToken: "discord-access-token",
        refreshToken: "discord-refresh-token",
        fetchTime: 1_700_000_000_000,
      },
      "tester@example.com",
      true,
    );

    await agent.get("/api/auth/twitch/callback").expect(302);

    const response = await agent.get("/api/auth/user").expect(200);
    const body = userResponseSchema.parse(response.body);

    expect(body.id).toBe("discord-user-1");
    expect(body.providers).toEqual(
      expect.arrayContaining(["discord", "twitch"]),
    );
  });
});
