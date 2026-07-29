import express from "express";

import type { Express, RequestHandler } from "express";

import type { TwitchStreamerProvider } from "../modules/twitch/ports/TwitchGateway.js";
import type { DiscordService } from "../modules/discord/ports/DiscordService.js";

import type { Repositories } from "../app/container/repositories.js";
import type { StreamNotificationService } from "../modules/notifications/application/StreamNotificationService.js";

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
};

export function createApp({
  sessionMiddleware,
  repositories,
  twitch,
  discord,
  services,
}: CreateAppOptions): Express {
  const app = express();

  app.set("trust proxy", 1);

  configureMiddleware({
    app,
    sessionMiddleware,
    identityRepository: repositories.identities,
    services,
  });

  configureRoutes({ app, repositories, twitch, discord });

  app.use((req) => {
    throw new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`);
  });

  app.use(errorHandler);

  return app;
}
