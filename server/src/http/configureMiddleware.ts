import type { Express, RequestHandler } from "express";
import type { Firestore } from "firebase-admin/firestore";

import helmet from "helmet";
import { rateLimit } from "express-rate-limit";

import cors from "cors";
import session from "express-session";

import cookieParser from "cookie-parser";

import { env } from "../shared/config/env.js";

import { createEventSubRouter } from "./routes/eventSubRoutes.js";
import { InMemoryReplayStore } from "../modules/notifications/infrastructure/InMemoryReplayStore.js";

import { FirestoreSessionRepository } from "../modules/auth/infrastructure/firestore/FirestoreSessionRepository.js";
import { configurePassport } from "./passport.js";

import type { AuthUserRepository } from "../modules/auth/ports/AuthUserRepository.js";
import type { StreamNotificationService } from "../modules/notifications/application/StreamNotificationService.js";

import { assertDefined } from "../shared/utils/assert.js";
import { requestId } from "./middleware/requestId.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { httpMetrics } from "./middleware/httpMetrics.js";
import { initializeValidatedRequest } from "./middleware/validate.js";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,
  standardHeaders: "draft-8", // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
  legacyHeaders: false,
  ipv6Subnet: 56, // Set to 60 or 64 to be less aggressive, or 52 or 48 to be more aggressive
  // Health/readiness probes are polled frequently by the orchestrator and
  // must never be starved by public API traffic sharing the same budget.
  skip: (req) => req.path.startsWith("/health") || req.path.startsWith("/metrics"),
});

// Twitch's own EventSub webhook traffic (plus redeliveries) is unauthenticated
// and public, so it needs its own bound distinct from the general API limiter
// rather than being left completely unlimited.
const eventSubLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  ipv6Subnet: 56,
});

type ConfigureMiddlewareOptions = {
  app: Express;
  sessionMiddleware: RequestHandler;
  authUserRepository: AuthUserRepository;
  services: {
    streamNotification: StreamNotificationService;
  };
};

export function createSessionMiddleware(firestore: Firestore): RequestHandler {
  return session({
    store: new FirestoreSessionRepository(firestore),

    secret: assertDefined(env.sessionSecret, "Session Secret"),

    resave: false,

    saveUninitialized: false,

    proxy: true,

    cookie: {
      secure: env.isProduction,

      httpOnly: true,

      sameSite: "lax",

      // Bounds how long a session (and its Firestore-backed document) stays
      // valid; without this, sessions never expire server-side and a stolen
      // session id would remain usable indefinitely.
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  });
}

export function configureMiddleware({
  app,
  sessionMiddleware,
  authUserRepository,
  services,
}: ConfigureMiddlewareOptions) {
  const configuredPassport = configurePassport(authUserRepository);
  const replayStore = new InMemoryReplayStore({
    ttlMs: 10 * 60_000,
  });

  app.use(helmet());

  app.use(
    cors({
      origin: env.clientOrigin,

      credentials: true,
    }),
  );

  app.use(requestId);

  app.use(cookieParser());

  app.use(initializeValidatedRequest);

  if (env.requestLogging.enabled) {
    app.use(requestLogger);
  }

  app.use(httpMetrics);

  app.use(sessionMiddleware);

  app.use(configuredPassport.initialize());

  app.use(configuredPassport.session());

  app.use(
    "/eventsub",

    eventSubLimiter,

    createEventSubRouter({
      secret: assertDefined(env.twitch.webhookSecret, "Twitch Webhook Secret"),

      replayStore,

      onNotification: (type, event) => {
        if (type === "stream.online") {
          return services.streamNotification.handleStreamOnline(event);
        }

        return Promise.resolve();
      },
    }),
  );

  app.use(limiter);
}
