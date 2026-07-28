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

import type { Repositories } from "../app/container/repositories.js";

import type { TwitchStreamerProvider } from "../modules/twitch/ports/TwitchGateway.js";
import type { DiscordService } from "../modules/discord/ports/DiscordService.js";

import { assertDefined } from "../shared/utils/assert.js";
import { createHealthRouter } from "./routes/healthRoutes.js";

type ConfigureRoutesOptions = {
  app: Express;

  repositories: Repositories;

  twitch: TwitchStreamerProvider & { isReady?: boolean };

  discord: DiscordService;
};

export function configureRoutes({
  app,
  repositories,
  twitch,
  discord,
}: ConfigureRoutesOptions): void {
  const ensureFreshToken = createFreshTokenMiddleware(repositories.authUsers);

  app.use(
    "/health",
    createHealthRouter({
      authUserRepository: repositories.authUsers,
      discord,
      twitch,
    }),
  );

  if (env.prometheus.enabled) {
    app.use("/metrics", createMetricsRouter());
  }

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  const authRouter = createAuthRouter({
    repository: repositories.users,

    discord,

    ensureFreshToken,
  });

  const apiRouter = createApiRouter({
    repositories,

    twitch,

    discord,

    ensureFreshToken,

    webPushPublicKey: assertDefined(
      env.webPush.publicKey,
      "Web Push Public Key",
    ),
  });

  // /api/v1 is a non-breaking alias of /api: same router instances, so a
  // future breaking change has somewhere to diverge to without forcing every
  // consumer to migrate on the same day. Registered most-specific-prefix
  // first ("/api/v1" before "/api"): Express matches `app.use("/api", ...)`
  // against any path starting with "/api/", which would otherwise shadow
  // every "/api/v1/..." route if "/api" were registered first.
  const prefixes = ["/api/v1", "/api"];

  for (const prefix of prefixes) {
    app.use(`${prefix}/auth`, authRouter);
  }

  for (const prefix of prefixes) {
    app.use(prefix, requireAuthenticated, apiRouter);
  }

  app.get(
    "/login-failed",

    (_req, res): void => {
      res.redirect(env.clientOrigin);
    },
  );
}
