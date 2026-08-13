import type { RequestHandler } from "express";

import { httpRequestDurationSeconds } from "../../infrastructure/metrics/prometheus.js";

// Express types req.route as `any`; narrow it to the one field we read.
type MatchedRoute = { path: string };

export const httpMetrics: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const matchedRoute = req.route as MatchedRoute | undefined;
    const route = matchedRoute
      ? `${req.baseUrl}${matchedRoute.path}`
      : "unmatched";

    httpRequestDurationSeconds.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode,
      },
      durationSeconds,
    );
  });

  next();
};
