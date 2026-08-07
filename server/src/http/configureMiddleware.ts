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
import { RedisReplayStore } from "../modules/notifications/infrastructure/RedisReplayStore.js";
import { RedisRateLimitStore } from "../infrastructure/redis/RedisRateLimitStore.js";

import { FirestoreSessionRepository } from "../modules/auth/infrastructure/firestore/FirestoreSessionRepository.js";
import { configurePassport } from "./passport.js";

import type { Redis } from "../infrastructure/redis/redisClient.js";
import type { IdentityRepository } from "../modules/auth/ports/IdentityRepository.js";
import type { StreamNotificationService } from "../modules/notifications/application/StreamNotificationService.js";

import { assertDefined } from "../shared/utils/assert.js";
import { requestId } from "./middleware/requestId.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { httpMetrics } from "./middleware/httpMetrics.js";
import { initializeValidatedRequest } from "./middleware/validate.js";

type ConfigureMiddlewareOptions = {
  app: Express;
  sessionMiddleware: RequestHandler;
  identityRepository: IdentityRepository;
  services: {
    streamNotification: StreamNotificationService;
  };
  /**
   * Backs the rate limiters and the EventSub replay store with Redis, so
   * both survive a restart and stay correct across multiple backend
   * instances - see infrastructure/redis/RedisRateLimitStore.ts and
   * modules/notifications/infrastructure/RedisReplayStore.ts. Optional so
   * tests that don't need to exercise that can skip standing up a Redis
   * connection, falling back to the previous in-process implementations -
   * the same pattern already used for Firestore-vs-InMemory repositories
   * throughout this codebase. Always supplied in production (see
   * app/container/index.ts).
   */
  redis?: Redis;
};

// express-session defaults to this name if none is given; naming it
// explicitly here (rather than relying on that default) lets authRoutes.ts's
// logout and openapi.ts's cookieAuth scheme import a single source of truth
// instead of hand-duplicating the literal.
export const SESSION_COOKIE_NAME = "connect.sid";

export function createSessionMiddleware(firestore: Firestore): RequestHandler {
  return session({
    name: SESSION_COOKIE_NAME,

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
  identityRepository,
  services,
  redis,
}: ConfigureMiddlewareOptions) {
  const configuredPassport = configurePassport(identityRepository);

  // eventSubRoutes.ts claims a message-id reservation *before* dispatching
  // to subscribers, and only releases it (replayStore.forget()) if dispatch
  // throws - a mid-flight process exit (a deploy's SIGTERM outrunning a slow
  // fan-out to many subscribers, or any of the app's process.exit(1) crash
  // paths) leaves an orphaned reservation that outlives the process. With
  // RedisReplayStore, that reservation survives the restart too, so Twitch's
  // retried delivery of the same event is wrongly treated as an
  // already-handled duplicate and silently dropped for the rest of the TTL.
  // Twitch's own retry behavior gives up after "a couple minutes" (not
  // formally documented) - keeping the TTL only slightly above that bounds
  // how long an orphaned reservation can block a legitimate retry, without
  // meaningfully weakening the actual dedup purpose (rejecting the
  // near-simultaneous duplicate deliveries Twitch's at-least-once guarantee
  // can produce), which happens on a much shorter timescale than 10 minutes.
  const replayStoreTtlMs = 3 * 60_000;

  const replayStore = redis
    ? new RedisReplayStore(redis, replayStoreTtlMs)
    : new InMemoryReplayStore({ ttlMs: replayStoreTtlMs });

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100,
    standardHeaders: "draft-8", // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
    legacyHeaders: false,
    ipv6Subnet: 56, // Set to 60 or 64 to be less aggressive, or 52 or 48 to be more aggressive
    // Health/readiness probes are polled frequently by the orchestrator and
    // must never be starved by public API traffic sharing the same budget.
    skip: (req) =>
      req.path.startsWith("/health") || req.path.startsWith("/metrics"),
    // A transient Redis blip must fail the request open (unrestricted)
    // rather than 500 every request until Redis recovers - rate limiting is
    // defense-in-depth, not something the whole API should go down over.
    passOnStoreError: true,
    ...(redis
      ? { store: new RedisRateLimitStore(redis, { prefix: "rl:api:" }) }
      : {}),
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
    passOnStoreError: true,
    ...(redis
      ? { store: new RedisRateLimitStore(redis, { prefix: "rl:eventsub:" }) }
      : {}),
  });

  app.use(helmet());

  app.use(
    cors({
      // An array, not a single string: the `cors` package matches the
      // request's Origin header against every entry, so a deployment
      // fronting more than one origin (see envSchema.ts's CLIENT_ORIGIN
      // comment) is allowed without a code change.
      origin: env.clientOrigins,

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

  // Mounted before sessionMiddleware/passport: Twitch's EventSub calls carry
  // no session cookie, so running the Firestore-backed session lookup and
  // passport's deserialize step on this path would be pure overhead on
  // what's meant to be a lean, high-volume public webhook endpoint.
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

  app.use(sessionMiddleware);

  app.use(configuredPassport.initialize());

  app.use(configuredPassport.session());

  app.use(limiter);
}
