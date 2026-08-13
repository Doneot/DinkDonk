import express from "express";
import session from "express-session";
import type {
  Profile as GoogleProfile,
  StrategyOptions as GoogleStrategyOptions,
} from "passport-google-oauth20";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { userResponseSchema } from "../../../http/schemas/responses.js";
import type { DiscordService } from "../../../modules/discord/ports/DiscordService.js";
import { InMemoryUserRepository } from "../../repositories/inMemory/InMemoryUserRepository.js";

type VerifyDone = (error: unknown, user?: unknown) => void;
type Verify = (
  accessToken: string,
  refreshToken: string,
  profile: GoogleProfile,
  done: VerifyDone,
) => void;

const PROFILE = {
  id: "google-user-1",
  displayName: "tester",
  emails: [{ value: "tester@example.com", verified: true }],
  photos: [{ value: "https://example.com/photo.jpg" }],
} as unknown as GoogleProfile;

/**
 * Mirrors oauthSessionRoundTrip.test.ts's FakeDiscordStrategy: stands in for
 * the real Google OAuth2 handshake without any network access, while still
 * going through passport's *real* authenticate/success machinery (req.login,
 * session regeneration).
 */
class FakeGoogleStrategy {
  name = "google";

  success!: (user: unknown) => void;
  fail!: () => void;
  error!: (err: unknown) => void;

  constructor(
    _options: GoogleStrategyOptions,
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

vi.mock("passport-google-oauth20", () => ({
  Strategy: FakeGoogleStrategy,
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

// A single app/passport configuration is shared across every test in this
// file (repositories are reset in beforeEach instead): passport.serializeUser
// /deserializeUser accumulate every registered function rather than replacing
// it (confirmed in passport's own Authenticator source), so calling
// configurePassport() more than once per process - once per test, as a fresh
// createApp() would - stacks up stale deserializers from earlier tests. Those
// stale deserializers run first and, on a miss against their own
// (now-orphaned) repository, short-circuit passport's whole deserializer
// chain by returning `false` before ever reaching the current test's real
// repository - which surfaces as a bogus 401 on the very next request.
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

describe("Google OAuth + session round trip (real passport, real express-session)", () => {
  it("keeps the user authenticated on the request immediately after login", async () => {
    const agent = request.agent(app);

    await agent.get("/api/auth/google/callback").expect(302);

    const response = await agent.get("/api/auth/user").expect(200);

    expect(userResponseSchema.parse(response.body)).toMatchObject({
      name: "tester",
      email: "tester@example.com",
      emailVerified: true,
      providers: ["google"],
    });
  });

  it("persists the authenticated user across more than one subsequent request", async () => {
    const agent = request.agent(app);

    await agent.get("/api/auth/google/callback").expect(302);

    await agent.get("/api/auth/user").expect(200);
    await agent.get("/api/auth/user").expect(200);
  });

  it("links onto an existing Discord-created account with the same verified email", async () => {
    const agent = request.agent(app);

    // A pre-existing Discord signup on the same verified email that Google
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

    await agent.get("/api/auth/google/callback").expect(302);

    const response = await agent.get("/api/auth/user").expect(200);
    const body = userResponseSchema.parse(response.body);

    expect(body.id).toBe("discord-user-1");
    expect(body.providers).toEqual(
      expect.arrayContaining(["discord", "google"]),
    );
  });
});
