import cors from "cors";
import express from "express";
import session from "express-session";
import type { Express, Request, Response } from "express";
import type { Firestore } from "firebase-admin/firestore";
import { env } from "../config/env.js";
import { FirestoreSessionRepository } from "../repositories/FirestoreSessionRepository.js";
import { configurePassport } from "./passport.js";
import {
  createFreshTokenMiddleware,
  requireAuthenticated,
} from "./middleware/auth.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createApiRouter } from "./routes/apiRoutes.js";
import { createEventSubRouter } from "./routes/eventSubRoutes.js";
import type { User } from "../types/user.js";
import type { TwitchStreamerService } from "../types/services/twitch.js";
import type { DiscordService } from "../types/services/discord.js";
import { assertDefined } from "../utils/assert.js";

type Repository = {
  getUser(userId: string): Promise<User | null>;

  saveUser(userId: string, data: Partial<User>): Promise<void>;

  listUsers(): Promise<User[]>;

  listPushSubscriptions(userId: string): Promise<unknown[]>;

  savePushSubscription(
    userId: string,
    subscription: unknown,
    metadata?: {
      userAgent?: string;
    },
  ): Promise<{
    success: boolean;

    reason?: string;
  }>;

  deletePushSubscription(
    userId: string,
    subscription: unknown,
  ): Promise<{
    success: boolean;

    reason?: string;
  }>;

  subscribeUserToStreamer(
    userId: string,
    streamerId: string,
    notificationMessage?: string,
  ): Promise<{
    success: boolean;

    reason?: string;
  }>;

  unsubscribeUserFromStreamer(
    userId: string,
    streamerId: string,
  ): Promise<{
    success: boolean;

    reason?: string;
  }>;

  getNotificationMessage(userId: string, streamerId: string): Promise<string>;

  setNotificationMessage(
    userId: string,
    streamerId: string,
    message: string,
  ): Promise<{
    success: boolean;

    reason?: string;
  }>;
};

type NotificationService = {
  handleStreamOnline(event: unknown): Promise<void>;
};

type CreateAppOptions = {
  firestore: Firestore;

  repository: Repository;

  twitch: TwitchStreamerService;

  discord: DiscordService;

  notificationService: NotificationService;
};

export function createApp({
  firestore,
  repository,
  twitch,
  discord,
  notificationService,
}: CreateAppOptions): Express {
  const app = express();

  const configuredPassport = configurePassport(repository);

  const ensureFreshToken = createFreshTokenMiddleware(repository);

  app.set("trust proxy", 1);

  app.use(
    cors({
      origin: env.clientOrigin,

      credentials: true,
    }),
  );

  app.use(
    session({
      store: new FirestoreSessionRepository(firestore),

      secret: assertDefined(env.sessionSecret, "Session Secret"),

      resave: false,

      saveUninitialized: false,

      proxy: true,

      cookie: {
        secure: env.isProduction,

        httpOnly: true,

        sameSite: "lax",
      },
    }),
  );

  app.use(configuredPassport.initialize());

  app.use(configuredPassport.session());

  app.get(
    "/api/health",

    (_req: Request, res: Response): void => {
      res.status(200).json({
        status: "ok",
      });
    },
  );

  app.use(
    "/api/auth",

    createAuthRouter({
      repository,

      discord,

      ensureFreshToken,
    }),
  );

  app.use(
    "/api",

    requireAuthenticated,

    createApiRouter({
      repository,

      twitch,

      discord,

      ensureFreshToken,

      webPushPublicKey: assertDefined(
        env.webPush.publicKey,
        "Web Push Public Key",
      ),
    }),
  );

  app.use(
    createEventSubRouter({
      secret: assertDefined(env.twitch.webhookSecret, "Twitch Webhook Secret"),

      onNotification: (type, event) => {
        if (type === "stream.online") {
          return notificationService.handleStreamOnline(event);
        }

        return Promise.resolve();
      },
    }),
  );

  app.get(
    "/login-failed",

    (_req: Request, res: Response): void => {
      res.redirect(env.clientOrigin);
    },
  );

  return app;
}
