import express from "express";

import type { AuthUserRepository } from "../../modules/auth/ports/AuthUserRepository.js";
import { logger } from "../../shared/logger/logger.js";

type ReadinessCheckable = {
  isReady?: boolean;
};

type CreateHealthRouterOptions = {
  authUserRepository: AuthUserRepository;
  discord?: ReadinessCheckable;
  twitch?: ReadinessCheckable;
};

export function createHealthRouter({
  authUserRepository,
  discord,
  twitch,
}: CreateHealthRouterOptions) {
  const router = express.Router();

  router.get("/live", (_, res) => {
    res.sendStatus(200);
  });

  router.get("/ready", async (_, res) => {
    try {
      await authUserRepository.checkConnection();

      const notReady = [
        discord?.isReady === false ? "discord" : null,
        twitch?.isReady === false ? "twitch" : null,
      ].filter((dependency): dependency is string => dependency !== null);

      if (notReady.length > 0) {
        logger.warn({ notReady }, "Readiness check failed");
        res.sendStatus(503);
        return;
      }

      res.sendStatus(200);
    } catch (error) {
      logger.error(error);
      res.sendStatus(503);
    }
  });

  return router;
}
