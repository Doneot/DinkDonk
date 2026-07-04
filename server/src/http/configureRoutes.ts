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

  twitch: TwitchStreamerProvider;

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
    createHealthRouter({ authUserRepository: repositories.authUsers }),
  );

  if (env.prometheus.enabled) {
    app.use("/metrics", createMetricsRouter());
  }

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.use(
    "/api/auth",

    createAuthRouter({
      repository: repositories.users,

      discord,

      ensureFreshToken,
    }),
  );

  app.use(
    "/api",

    requireAuthenticated,

    createApiRouter({
      repositories,

      twitch,

      discord,

      ensureFreshToken,

      webPushPublicKey: assertDefined(
        env.webPush.publicKey,
        "Web Push Public Key",
      ),
    }),
  );

  app.get(
    "/login-failed",

    (_req, res): void => {
      res.redirect(env.clientOrigin);
    },
  );
}
