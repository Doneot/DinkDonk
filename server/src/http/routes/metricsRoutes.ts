import express from "express";

import { register } from "../../infrastructure/metrics/prometheus.js";

export function createMetricsRouter() {
  const router = express.Router();

  router.get("/", async (_req, res) => {
    res.setHeader("Content-Type", register.contentType);

    res.end(await register.metrics());
  });

  return router;
}
