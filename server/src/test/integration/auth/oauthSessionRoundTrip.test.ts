import express from "express";
import session from "express-session";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile, StrategyOptionsWithRequest } from "passport-discord";

import type { DiscordService } from "../../../modules/discord/ports/DiscordService.js";
import { userResponseSchema } from "../../../http/schemas/responses.js";
import { InMemoryUserRepository } from "../../repositories/inMemory/InMemoryUserRepository.js";

type VerifyDone = (error: unknown, user?: unknown) => void;
type Verify = (
  req: express.Request,
  accessToken: string,
  refreshToken: string,
  profile: Profile,
  done: VerifyDone,
) => Promise<void>;

const PROFILE = {
  id: "discord-user-1",
  username: "tester",
  discriminator: "0001",
  avatar: "avatar.png",
} as unknown as Profile;

/**
 * Stands in for the real OAuth2 handshake (redirect to Discord, exchange the
 * callback code for a token) without any network access, while still going
 * through passport's *real* `authenticate`/`success` machinery — which is
 * what actually calls `req.login()` and regenerates the session. Unlike
 * `passport.test.ts`'s mock (which mocks the whole `passport` package and
 * never touches a real session), this only fakes the Discord-specific half.
 */
class FakeDiscordStrategy {
  name = "discord";

  // Populated by passport's Authenticator before `authenticate()` is called.
  success!: (user: unknown) => void;
  fail!: () => void;
  error!: (err: unknown) => void;
  redirect!: (url: string) => void;

  constructor(
    _options: StrategyOptionsWithRequest,
    private readonly verify: Verify,
  ) {}

  authenticate(req: express.Request): void {
    // Mirrors the real strategy's two legs: /discord(/link) has no `code`
    // yet (redirect off to the provider), only /discord/callback does.
    if (typeof req.query.code !== "string") {
      this.redirect("https://discord.com/oauth2/authorize");
      return;
    }

    void this.verify(
      req,
      "access-token",
      "refresh-token",
      PROFILE,
      (error, user) => {
        if (error) {
          this.error(error);
          return;
        }

        if (!user) {
          this.fail();
          return;
        }

        this.success(user);
      },
    );
  }
}

vi.mock("passport-discord", () => ({
  Strategy: FakeDiscordStrategy,
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
// it, so calling configurePassport() more than once per process - once per
// test, as a fresh createApp() would - stacks up stale deserializers from
// earlier tests. Those stale deserializers run first and, on a miss against
// their own (now-orphaned) repository, short-circuit passport's whole
// deserializer chain by returning `false` before ever reaching the current
// test's real repository - which surfaces as a bogus 401 on the very next
// request. (Discord's deterministic fake uid happened to mask this here,
// since a stale deserializer's repository often still resolves the same
// "discord-user-1" id - see googleOauthSessionRoundTrip.test.ts, where a
// random per-signup uid makes the same bug impossible to miss.)
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

describe("Discord OAuth + session round trip (real passport, real express-session)", () => {
  it("keeps the user authenticated on the request immediately after login", async () => {
    const agent = request.agent(app);

    // Step 1: the OAuth callback. The fake strategy succeeds immediately;
    // passport's real `req.login()` runs for real here, regenerating the
    // session and setting req.session.passport.user.
    await agent.get("/api/auth/discord/callback?code=fake-code").expect(302);

    // Step 2: a *separate* request reusing the same cookie jar. If anything
    // between login and the response wipes req.session.passport (e.g. an
    // extra, redundant session regenerate), this request would 401 instead
    // of resolving the logged-in user.
    const response = await agent.get("/api/auth/user").expect(200);

    expect(userResponseSchema.parse(response.body)).toMatchObject({
      id: "discord-user-1",
      name: "tester",
      providers: ["discord"],
    });
  });

  it("persists the authenticated user across more than one subsequent request", async () => {
    const agent = request.agent(app);

    await agent.get("/api/auth/discord/callback?code=fake-code").expect(302);

    await agent.get("/api/auth/user").expect(200);
    await agent.get("/api/auth/user").expect(200);
  });

  it("drives the linking branch (not a plain re-login) through a real /discord/link round trip", async () => {
    const agent = request.agent(app);

    // Establishes a real, cookie-backed session (exercising the login branch).
    await agent.get("/api/auth/discord/callback?code=fake-code").expect(302);

    const linkSpy = vi.spyOn(identityRepository, "linkDiscordIdentity");
    const upsertSpy = vi.spyOn(identityRepository, "upsertDiscordIdentity");

    // /discord/link stashes the current uid in the session before handing
    // off to the (fake) Discord strategy, so this callback should resolve
    // through linkDiscordIdentity rather than upsertDiscordIdentity's
    // by-email resolution.
    await agent.get("/api/auth/discord/link").expect(302);
    await agent.get("/api/auth/discord/callback?code=fake-code").expect(302);

    expect(linkSpy).toHaveBeenCalledWith(
      "discord-user-1",
      expect.objectContaining({ id: "discord-user-1" }),
      null,
      false,
    );
    expect(upsertSpy).not.toHaveBeenCalled();

    const response = await agent.get("/api/auth/user").expect(200);

    expect(userResponseSchema.parse(response.body)).toMatchObject({
      id: "discord-user-1",
      providers: ["discord"],
    });
  });
});
