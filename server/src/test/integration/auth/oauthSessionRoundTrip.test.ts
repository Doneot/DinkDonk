import express from "express";
import session from "express-session";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Profile, StrategyOptionsWithRequest } from "passport-discord";

import type { DiscordService } from "../../../modules/discord/ports/DiscordService.js";
import { userResponseSchema } from "../../../http/schemas/responses.js";
import { InMemoryUserRepository } from "../../repositories/inMemory/InMemoryUserRepository.js";

type VerifyDone = (error: unknown, user?: unknown) => void;
type Verify = (
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

  constructor(
    _options: StrategyOptionsWithRequest,
    private readonly verify: Verify,
  ) {}

  authenticate(): void {
    void this.verify("access-token", "refresh-token", PROFILE, (error, user) => {
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
const { InMemoryAuthUserRepository } = await import(
  "../../repositories/inMemory/InMemoryAuthUserRepository.js"
);

const passport = passportModule.default;

function createApp() {
  const authUserRepository = new InMemoryAuthUserRepository();
  const userRepository = new InMemoryUserRepository();

  configurePassport(authUserRepository);

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
      discord,
      ensureFreshToken: (_req, _res, next) => next(),
    }),
  );

  app.use(errorHandler);

  return { app, authUserRepository, userRepository };
}

describe("Discord OAuth + session round trip (real passport, real express-session)", () => {
  it("keeps the user authenticated on the request immediately after login", async () => {
    const { app } = createApp();
    const agent = request.agent(app);

    // Step 1: the OAuth callback. The fake strategy succeeds immediately;
    // passport's real `req.login()` runs for real here, regenerating the
    // session and setting req.session.passport.user.
    await agent.get("/api/auth/discord/callback").expect(302);

    // Step 2: a *separate* request reusing the same cookie jar. If anything
    // between login and the response wipes req.session.passport (e.g. an
    // extra, redundant session regenerate), this request would 401 instead
    // of resolving the logged-in user.
    const response = await agent.get("/api/auth/user").expect(200);

    expect(userResponseSchema.parse(response.body)).toMatchObject({
      id: "discord-user-1",
      username: "tester",
      discriminator: "0001",
    });
  });

  it("persists the authenticated user across more than one subsequent request", async () => {
    const { app } = createApp();
    const agent = request.agent(app);

    await agent.get("/api/auth/discord/callback").expect(302);

    await agent.get("/api/auth/user").expect(200);
    await agent.get("/api/auth/user").expect(200);
  });
});
