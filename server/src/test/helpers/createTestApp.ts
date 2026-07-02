import express from "express";
import session from "express-session";
import cookieParser from "cookie-parser";

import type { Express, NextFunction, Request, Response } from "express";

import type { Repositories } from "../../app/container/repositories.js";
import type { DiscordService } from "../../modules/discord/ports/DiscordService.js";
import type { TwitchStreamerProvider } from "../../modules/twitch/ports/TwitchGateway.js";

import { createApiRouter } from "../../http/routes/apiRoutes.js";
import { requestId } from "../../http/middleware/requestId.js";
import { initializeValidatedRequest } from "../../http/middleware/validate.js";
import { requireAuthenticated } from "../../http/middleware/auth.js";
import { errorHandler } from "../../http/middleware/errorHandler.js";
import { ensureCsrfCookie } from "../../http/middleware/csrf.js";

import { InMemoryUserRepository } from "../repositories/inMemory/InMemoryUserRepository.js";
import { InMemoryAuthUserRepository } from "../repositories/inMemory/InMemoryAuthUserRepository.js";
import { InMemoryStreamerRepository } from "../repositories/inMemory/InMemoryStreamerRepository.js";
import { InMemorySubscriptionRepository } from "../repositories/inMemory/InMemorySubscriptionRepository.js";
import { InMemoryPushSubscriptionRepository } from "../repositories/inMemory/InMemoryPushSubscriptionRepository.js";

const authUser = {
  id: "user-1",
  username: "tester",
  discriminator: "0",
  avatar: "",
  accessToken: "access-token",
  refreshToken: "refresh-token",
  fetchTime: Date.now(),
};

function createRepositories(): Repositories {
  return {
    users: new InMemoryUserRepository(),
    authUsers: new InMemoryAuthUserRepository(),
    streamers: new InMemoryStreamerRepository(),
    subscriptions: new InMemorySubscriptionRepository(),
    pushSubscriptions: new InMemoryPushSubscriptionRepository(),
  };
}

function createTwitch(): TwitchStreamerProvider {
  return {
    getStreamer: async () => await Promise.resolve(null),
    fetchStreamers: async () => await Promise.resolve([]),
    searchStreamers: async () =>
      await Promise.resolve([
        {
          id: "streamer-1",
          login: "streamer",
          display_name: "Streamer",
          profile_image_url: "https://example.com/avatar.png",
        },
      ]),
  };
}

function createDiscord(): DiscordService {
  return {
    isReady: true,
    canSendDirectMessage: async () => await Promise.resolve(true),
  };
}

export interface TestContext {
  app: Express;
  repositories: Repositories;
  twitch: TwitchStreamerProvider;
  discord: DiscordService;
}

export function createTestApp(options?: {
  authenticated?: boolean;
  csrf?: boolean;
}): TestContext {
  const repositories = createRepositories();
  const twitch = createTwitch();
  const discord = createDiscord();

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
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = authUser;
      next();
    });
  }

  if (options?.csrf) {
    app.use(ensureCsrfCookie);
  }

  app.use(
    "/api",
    requireAuthenticated,
    createApiRouter({
      repositories,
      twitch,
      discord,
      ensureFreshToken: (_req, _res, next) => next(),
      webPushPublicKey: "test-public-key",
      csrfEnabled: Boolean(options?.csrf),
    }),
  );

  app.use(errorHandler);

  return {
    app,
    repositories,
    twitch,
    discord,
  };
}
