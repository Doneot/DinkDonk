import cookieParser from "cookie-parser";
import express from "express";
import session from "express-session";

import type { Express, NextFunction, Request, Response } from "express";

import { createApiRouter } from "../../http/routes/apiRoutes.js";
import { requireAuthenticated } from "../../http/middleware/auth.js";
import { errorHandler } from "../../http/middleware/errorHandler.js";
import { requestId } from "../../http/middleware/requestId.js";
import { initializeValidatedRequest } from "../../http/middleware/validate.js";

import { seedState } from "../fixtures/seedState.js";
import { createTestContainer } from "./createTestContainer.js";
import type { TestState } from "../fixtures/seedState.js";

const DEFAULT_AUTH_USER = Object.freeze({
  id: "user-1",
  username: "tester",
  discriminator: "0",
  avatar: "",
  accessToken: "access-token",
  refreshToken: "refresh-token",
  fetchTime: Date.now(),
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

  app.use(
    "/api",
    requireAuthenticated,
    createApiRouter({
      repositories: container.repositories,
      twitch: container.twitch,
      discord: container.discord,
      ensureFreshToken: (_req, _res, next) => next(),
      webPushPublicKey: options.webPushPublicKey ?? TEST_WEB_PUSH_PUBLIC_KEY,
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
