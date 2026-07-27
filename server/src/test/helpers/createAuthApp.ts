import express from "express";
import session from "express-session";
import type { Express, NextFunction, Request, Response } from "express";

import { errorHandler } from "../../http/middleware/errorHandler.js";
import { requestId } from "../../http/middleware/requestId.js";
import { initializeValidatedRequest } from "../../http/middleware/validate.js";
import { createAuthRouter } from "../../http/routes/authRoutes.js";

import { buildAuthUser } from "../builders/auth.js";
import { seedState } from "../fixtures/seedState.js";
import type { TestState } from "../fixtures/seedState.js";
import { createTestContainer } from "./createTestContainer.js";

export const AUTH_TEST_USER = buildAuthUser({
  id: "user-1",
  username: "tester",
  discriminator: "0001",
  avatar: "avatar.png",
});

export type CreateAuthTestAppOptions = {
  authenticated?: boolean;
  state?: TestState;
  /** Simulates passport failing to tear the login session down. */
  logoutError?: Error;
};

export type AuthTestContext = {
  app: Express;
  repositories: ReturnType<typeof createTestContainer>["repositories"];
  discord: ReturnType<typeof createTestContainer>["discord"];
};

export async function createAuthTestApp({
  authenticated = true,
  state,
  logoutError,
}: CreateAuthTestAppOptions = {}): Promise<AuthTestContext> {
  const container = createTestContainer();

  await seedState(container, state);

  const app = express();

  app.use(requestId);
  app.use(express.json());
  app.use(initializeValidatedRequest);

  app.use(
    session({
      secret: "test-session-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: "lax" },
    }),
  );

  // Stands in for the passport session middleware, which is mocked away in
  // these tests so the routes can be exercised without a real OAuth exchange.
  app.use((req: Request, _res: Response, next: NextFunction): void => {
    req.logout = ((callback: (error?: Error) => void) => {
      callback(logoutError);
    }) as Request["logout"];

    if (authenticated) {
      req.user = AUTH_TEST_USER;
    }

    next();
  });

  app.use(
    "/api/auth",
    createAuthRouter({
      repository: container.repositories.users,
      discord: container.discord,
      ensureFreshToken: (_req, _res, next) => next(),
    }),
  );

  app.use(errorHandler);

  return {
    app,
    repositories: container.repositories,
    discord: container.discord,
  };
}
