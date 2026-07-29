import express from "express";
import session from "express-session";
import type { Express, NextFunction, Request, Response } from "express";

import { errorHandler } from "../../http/middleware/errorHandler.js";
import { requestId } from "../../http/middleware/requestId.js";
import { initializeValidatedRequest } from "../../http/middleware/validate.js";
import { createAuthRouter } from "../../http/routes/authRoutes.js";

import type { Identity } from "../../modules/auth/domain/Identity.js";
import { buildIdentity, buildSessionUser } from "../builders/auth.js";
import { seedState } from "../fixtures/seedState.js";
import type { TestState } from "../fixtures/seedState.js";
import { createTestContainer } from "./createTestContainer.js";
import type { InMemoryIdentityRepository } from "../repositories/inMemory/InMemoryIdentityRepository.js";

export const AUTH_TEST_USER = buildSessionUser({
  id: "user-1",
  name: "tester",
  avatarUrl: "https://cdn.discordapp.com/avatars/user-1/avatar.png",
});

export type CreateAuthTestAppOptions = {
  authenticated?: boolean;
  state?: TestState;
  /** Simulates passport failing to tear the login session down. */
  logoutError?: Error;
  /**
   * The identity backing AUTH_TEST_USER's session, seeded into the identities
   * repository so routes that resolve a linked Discord id (rather than
   * assuming uid === discordId) have something real to look up. Defaults to
   * a Discord-linked identity matching AUTH_TEST_USER's id; pass `null` to
   * simulate a session with no corresponding identity record.
   */
  identity?: Identity | null;
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
  identity = buildIdentity({ uid: AUTH_TEST_USER.id }),
}: CreateAuthTestAppOptions = {}): Promise<AuthTestContext> {
  const container = createTestContainer();

  await seedState(container, state);

  if (identity) {
    (
      container.repositories.identities as InMemoryIdentityRepository
    ).seed(identity);
  }

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
      identities: container.repositories.identities,
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
