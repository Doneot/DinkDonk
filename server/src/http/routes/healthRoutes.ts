import express from "express";

import type { IdentityRepository } from "../../modules/auth/ports/IdentityRepository.js";
import { logger } from "../../shared/logger/logger.js";

type ReadinessCheckable = {
  isReady?: boolean;
};

type CreateHealthRouterOptions = {
  identityRepository: IdentityRepository;
  discord?: ReadinessCheckable;
  twitch?: ReadinessCheckable;
};

export function createHealthRouter({
  identityRepository,
  discord,
  twitch,
}: CreateHealthRouterOptions) {
  const router = express.Router();

  router.get("/live", (_, res) => {
    res.sendStatus(200);
  });

  router.get("/ready", async (_, res) => {
    try {
      await identityRepository.checkConnection();

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
