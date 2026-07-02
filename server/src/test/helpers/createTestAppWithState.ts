import express from "express";
import session from "express-session";
import cookieParser from "cookie-parser";

import type { Express, NextFunction, Request, Response } from "express";

import { createApiRouter } from "../../http/routes/apiRoutes.js";
import { requestId } from "../../http/middleware/requestId.js";
import { initializeValidatedRequest } from "../../http/middleware/validate.js";
import { requireAuthenticated } from "../../http/middleware/auth.js";
import { errorHandler } from "../../http/middleware/errorHandler.js";
import { ensureCsrfCookie } from "../../http/middleware/csrf.js";

import { createTestContainer } from "./createTestContainer.js";
import type { User } from "../../modules/users/domain/User.js";
import type { PushSubscription } from "../../modules/notifications/domain/PushSubscription.js";

const authUser = {
  id: "user-1",
  username: "tester",
  discriminator: "0",
  avatar: "",
  accessToken: "access-token",
  refreshToken: "refresh-token",
  fetchTime: Date.now(),
};

function mockAuth(user = authUser) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.user = user;
    next();
  };
}

/**
 * Declarative test state
 */
export type TestState = {
  users?: User[];
  subscriptions?: Array<{
    userId: string;
    streamerId: string;
    notification_message?: string;
  }>;
  pushSubscriptions?: Array<{ userId: string; subscription: PushSubscription }>;
  streamers?: Array<{ id: string }>;
};

async function seedState(
  container: ReturnType<typeof createTestContainer>,
  state?: TestState,
) {
  if (!state) return;

  const { repositories } = container;

  // USERS
  for (const user of state.users ?? []) {
    await repositories.users.updateUser(user.id, user);
  }

  // STREAMERS
  for (const streamer of state.streamers ?? []) {
    await repositories.streamers.createStreamer(streamer.id);
  }

  // SUBSCRIPTIONS
  for (const sub of state.subscriptions ?? []) {
    await repositories.subscriptions.subscribe(
      sub.userId,
      sub.streamerId,
      sub.notification_message ?? "",
    );
  }

  // PUSH SUBSCRIPTIONS
  for (const ps of state.pushSubscriptions ?? []) {
    const {
      subscription: { endpoint },
      userAgent,
    } = ps.subscription;

    await repositories.pushSubscriptions.savePushSubscription(
      ps.userId,
      { endpoint },
      userAgent ? { userAgent } : undefined,
    );
  }
}

export interface TestContext {
  app: Express;
  repositories: ReturnType<typeof createTestContainer>["repositories"];
  twitch: ReturnType<typeof createTestContainer>["twitch"];
  discord: ReturnType<typeof createTestContainer>["discord"];
}

export async function createTestAppWithState(options?: {
  authenticated?: boolean;
  csrf?: boolean;
  state?: TestState;
}): Promise<TestContext> {
  const container = createTestContainer();

  await seedState(container, options?.state);

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

  if (options?.authenticated !== false) {
    app.use(mockAuth());
  }

  if (options?.csrf) {
    app.use(ensureCsrfCookie);
  }

  app.use(
    "/api",
    requireAuthenticated,
    createApiRouter({
      repositories: container.repositories,
      twitch: container.twitch,
      discord: container.discord,
      ensureFreshToken: (_req, _res, next) => next(),
      webPushPublicKey: "test-public-key",
      csrfEnabled: Boolean(options?.csrf),
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
