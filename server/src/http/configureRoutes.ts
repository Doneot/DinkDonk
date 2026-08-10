import type { Express } from "express";

import swaggerUi from "swagger-ui-express";

import { openApiDocument } from "../docs/openapi.js";

import { env } from "../shared/config/env.js";

import {
  createFreshTokenMiddleware,
  requireAuthenticated,
} from "./middleware/auth.js";

import { createAuthRouter } from "./routes/authRoutes.js";
import { createApiRouter } from "./routes/apiRoutes.js";
import { createMetricsRouter } from "./routes/metricsRoutes.js";
import { createClientErrorRouter } from "./routes/clientErrorRoutes.js";

import type { Repositories } from "../app/container/repositories.js";

import type { TwitchStreamerProvider } from "../modules/twitch/ports/TwitchGateway.js";
import type { DiscordService } from "../modules/discord/ports/DiscordService.js";
import type { Redis } from "../infrastructure/redis/redisClient.js";
import type { StreamerLiveStateService } from "../modules/streamers/application/StreamerLiveStateService.js";

import { createHealthRouter } from "./routes/healthRoutes.js";
import { createMetricsAuth } from "./middleware/metricsAuth.js";

type ConfigureRoutesOptions = {
  app: Express;

  repositories: Repositories;

  twitch: TwitchStreamerProvider & { isReady?: boolean };

  discord: DiscordService;

  services: {
    streamerLiveState: StreamerLiveStateService;
  };

  /**
   * Forwarded to the auth router so /logout can drop a user's live
   * Socket.IO connections (see realtime/socketServer.ts's
   * SocketServer#disconnectUser) once their session is destroyed. Optional
   * so a caller that hasn't wired the socket server through yet still
   * compiles.
   */
  disconnectUser?: (userId: string) => void;

  /** See middleware/auth.ts's createFreshTokenMiddleware. */
  redis?: Redis;
};

export function configureRoutes({
  app,
  repositories,
  twitch,
  discord,
  services,
  disconnectUser,
  redis,
}: ConfigureRoutesOptions): void {
  const ensureFreshToken = createFreshTokenMiddleware(
    repositories.identities,
    redis,
  );

  app.use(
    "/health",
    createHealthRouter({
      identityRepository: repositories.identities,
      discord,
      twitch,
    }),
  );

  if (env.prometheus.enabled) {
    const metricsGuards = env.prometheus.metricsToken
      ? [createMetricsAuth(env.prometheus.metricsToken)]
      : [];

    app.use("/metrics", ...metricsGuards, createMetricsRouter());
  }

  // Never served in production: the OpenAPI document/Swagger UI has no
  // authentication of its own, and shouldn't be a public, unauthenticated
  // way to enumerate every route this deployment exposes.
  if (!env.isProduction) {
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  }

  const authRouter = createAuthRouter({
    repository: repositories.users,

    identities: repositories.identities,

    discord,

    ensureFreshToken,

    ...(disconnectUser ? { disconnectUser } : {}),
  });

  const apiRouter = createApiRouter({
    repositories,

    twitch,

    discord,

    ensureFreshToken,

    webPushPublicKey: env.webPush.publicKey,

    services,
  });

  // /api/v1 is a non-breaking alias of /api: same router instances, so a
  // future breaking change has somewhere to diverge to without forcing every
  // consumer to migrate on the same day. Registered most-specific-prefix
  // first ("/api/v1" before "/api"): Express matches `app.use("/api", ...)`
  // against any path starting with "/api/", which would otherwise shadow
  // every "/api/v1/..." route if "/api" were registered first.
  const clientErrorRouter = createClientErrorRouter();

  const prefixes = ["/api/v1", "/api"];

  for (const prefix of prefixes) {
    app.use(`${prefix}/auth`, authRouter);
  }

  // Unauthenticated, same as /auth above - registered ahead of the
  // requireAuthenticated-gated /api mount below so a pre-login crash (e.g.
  // on the Login page) can still be reported. See clientErrorRoutes.ts's
  // own doc comment for why this doesn't require a session.
  for (const prefix of prefixes) {
    app.use(`${prefix}/client-errors`, clientErrorRouter);
  }

  for (const prefix of prefixes) {
    app.use(prefix, requireAuthenticated, apiRouter);
  }

  app.get(
    "/login-failed",

    (_req, res): void => {
      // Deliberately the singular env.clientOrigin (the first configured
      // origin), not the full env.clientOrigins list used for CORS matching
      // above - a redirect's Location header needs exactly one concrete URL
      // to send the browser to, not a set of allowed origins.
      res.redirect(env.clientOrigin);
    },
  );
}
