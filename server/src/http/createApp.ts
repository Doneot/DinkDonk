import express from "express";

import type { Express, RequestHandler } from "express";

import type { TwitchStreamerProvider } from "../modules/twitch/ports/TwitchGateway.js";
import type { DiscordService } from "../modules/discord/ports/DiscordService.js";

import type { Repositories } from "../app/container/repositories.js";
import type { StreamNotificationService } from "../modules/notifications/application/StreamNotificationService.js";
import type { Redis } from "../infrastructure/redis/redisClient.js";

import { configureRoutes } from "./configureRoutes.js";
import { configureMiddleware } from "./configureMiddleware.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { NotFoundError } from "./errors/NotFoundError.js";

type CreateAppOptions = {
  sessionMiddleware: RequestHandler;

  repositories: Repositories;

  twitch: TwitchStreamerProvider;

  discord: DiscordService;

  services: {
    streamNotification: StreamNotificationService;
  };

  /**
   * Forcibly disconnects a user's live Socket.IO connections (see
   * realtime/socketServer.ts's SocketServer#disconnectUser) once their
   * session is destroyed. Optional so a caller that never sets up realtime
   * (e.g. some tests) doesn't need to supply one.
   */
  disconnectUser?: (userId: string) => void;

  /** See configureMiddleware.ts's ConfigureMiddlewareOptions.redis. */
  redis?: Redis;
};

export function createApp({
  sessionMiddleware,
  repositories,
  twitch,
  discord,
  services,
  disconnectUser,
  redis,
}: CreateAppOptions): Express {
  const app = express();

  app.set("trust proxy", 1);

  configureMiddleware({
    app,
    sessionMiddleware,
    identityRepository: repositories.identities,
    services,
    ...(redis ? { redis } : {}),
  });

  configureRoutes({
    app,
    repositories,
    twitch,
    discord,
    ...(disconnectUser ? { disconnectUser } : {}),
    ...(redis ? { redis } : {}),
  });

  app.use((req) => {
    throw new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`);
  });

  app.use(errorHandler);

  return app;
}
