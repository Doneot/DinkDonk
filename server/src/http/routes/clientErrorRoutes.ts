import express from "express";
import type { Router } from "express";

import { logger } from "../../shared/logger/logger.js";
import { validateBody, validatedBody } from "../middleware/validate.js";
import {
  clientErrorReportSchema,
  type ClientErrorReport,
} from "../schemas/clientErrors.js";

/**
 * Closes the frontend's error-visibility gap: `ErrorBoundary` and a couple
 * of hooks used to terminate a caught error in `console.error`, which
 * nothing outside the user's own browser console ever saw. This gives the
 * frontend a place to forward those same errors into the backend's
 * existing structured-logging pipeline (pino -> Grafana), the same place
 * every server-side error already lands, without standing up a separate
 * third-party error-tracking vendor.
 *
 * Deliberately does not require a session: a crash on the (unauthenticated)
 * Login page is exactly the kind of thing this should still be able to
 * report. Protected instead by the app-wide rate limiter (mounted ahead of
 * every route configureRoutes.ts registers - see configureMiddleware.ts)
 * and this route's own tight JSON body limit.
 */
export function createClientErrorRouter(): Router {
  const router = express.Router();

  router.post(
    "/",

    // Small, fixed limit rather than the general apiRouter's default: this
    // is unauthenticated telemetry input from a browser we don't control,
    // and clientErrorReportSchema's own field-length caps already bound
    // what a well-formed report looks like - this just rejects an
    // oversized body before it's even parsed as JSON.
    express.json({ limit: "16kb" }),

    validateBody(clientErrorReportSchema),

    (req, res): void => {
      const report = validatedBody<ClientErrorReport>(req);

      logger.warn(
        {
          requestId: req.requestId,

          // Present when the reporting page happened to have an
          // authenticated session (most of the app), absent on a
          // pre-login crash - either way, not required to accept the report.
          userId: req.user?.id,

          context: report.context,
          url: report.url,
          message: report.message,
          stack: report.stack,
          componentStack: report.componentStack,
        },
        "Client-reported error",
      );

      res.sendStatus(204);
    },
  );

  return router;
}
