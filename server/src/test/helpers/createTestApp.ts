import cookieParser from "cookie-parser";
import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import session from "express-session";

import { requireAuthenticated } from "../../http/middleware/auth.js";
import { errorHandler } from "../../http/middleware/errorHandler.js";
import { requestId } from "../../http/middleware/requestId.js";
import { initializeValidatedRequest } from "../../http/middleware/validate.js";
import { createApiRouter } from "../../http/routes/apiRoutes.js";
import type { Identity, SessionUser } from "../../modules/auth/domain/Identity.js";
import { StreamerLiveStateService } from "../../modules/streamers/application/StreamerLiveStateService.js";
import { buildIdentity } from "../builders/auth.js";
import { seedState } from "../fixtures/seedState.js";
import type { TestState } from "../fixtures/seedState.js";
import type { InMemoryIdentityRepository } from "../repositories/inMemory/InMemoryIdentityRepository.js";
import { createTestContainer } from "./createTestContainer.js";

const DEFAULT_AUTH_USER = Object.freeze<SessionUser>({
  id: "user-1",
  email: "tester@example.com",
  emailVerified: true,
  name: "tester",
  avatarUrl: null,
  providers: ["discord"],
});

export interface TestContext {
  app: Express;
  repositories: ReturnType<typeof createTestContainer>["repositories"];
  twitch: ReturnType<typeof createTestContainer>["twitch"];
  discord: ReturnType<typeof createTestContainer>["discord"];
}

export const TEST_WEB_PUSH_PUBLIC_KEY = "test-public-key";

export type CreateTestAppOptions = {
  authenticated?: boolean;
  authUser?: typeof DEFAULT_AUTH_USER;
  state?: TestState;
  webPushPublicKey?: string;
  /**
   * The identity backing the authenticated session, seeded into the
   * identities repository so routes that resolve a linked Discord id (rather
   * than assuming uid === discordId) have something real to look up.
   * Defaults to a Discord-linked identity matching the auth user's id; pass
   * `null` to simulate a session with no corresponding identity record.
   */
  identity?: Identity | null;
};

function mockAuthenticatedUser(user = DEFAULT_AUTH_USER) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.user = user;
    next();
  };
}

export async function createTestApp(
  options: CreateTestAppOptions = {},
): Promise<TestContext> {
  const container = createTestContainer();

  await seedState(container, options.state);

  const identity =
    options.identity === undefined
      ? buildIdentity({ uid: (options.authUser ?? DEFAULT_AUTH_USER).id })
      : options.identity;

  if (identity) {
    (
      container.repositories.identities as InMemoryIdentityRepository
    ).seed(identity);
  }

  const app = express();

  app.use(requestId);
  app.use(cookieParser());
  app.use(initializeValidatedRequest);

  app.use(
    session({
      secret: "test-session-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
      },
    }),
  );

  if (options.authenticated !== false) {
    app.use(mockAuthenticatedUser(options.authUser));
  }

  const streamerLiveState = new StreamerLiveStateService(
    container.repositories.streamers,
    () => {},
  );

  app.use(
    "/api",
    requireAuthenticated,
    createApiRouter({
      repositories: container.repositories,
      twitch: container.twitch,
      discord: container.discord,
      ensureFreshToken: (_req, _res, next) => next(),
      webPushPublicKey: options.webPushPublicKey ?? TEST_WEB_PUSH_PUBLIC_KEY,
      services: { streamerLiveState },
    }),
  );

  app.use(errorHandler);

  return {
    app,
    repositories: container.repositories,
    twitch: container.twitch,
    discord: container.discord,
  };
}
