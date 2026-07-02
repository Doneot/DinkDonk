import express from "express";

import type { AuthUserRepository } from "../../modules/auth/ports/AuthUserRepository.js";
import { logger } from "../../shared/logger/logger.js";

type CreateHealthRouterOptions = {
  authUserRepository: AuthUserRepository;
};

export function createHealthRouter({
  authUserRepository,
}: CreateHealthRouterOptions) {
  const router = express.Router();

  router.get("/live", (_, res) => {
    res.sendStatus(200);
  });

  router.get("/ready", async (_, res) => {
    try {
      await authUserRepository.checkConnection();

      res.sendStatus(200);
    } catch (error) {
      logger.error(error);
      res.sendStatus(503);
    }
  });

  return router;
}
