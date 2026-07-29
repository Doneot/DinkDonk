import { timingSafeEqual } from "node:crypto";

import type { RequestHandler } from "express";

import { UnauthorizedError } from "../errors/UnauthorizedError.js";

/**
 * Guards /metrics with a shared bearer token. Deployment already keeps this
 * route off the public reverse proxy (only Prometheus, on the private Docker
 * network, ever reaches it) - this is defense in depth for that boundary,
 * since operational metrics (request rates per route, etc.) shouldn't be
 * exposed to anyone who ends up with network access.
 */
export function createMetricsAuth(token: string): RequestHandler {
  const expected = Buffer.from(token);

  return (req, _res, next) => {
    const header = req.get("authorization");
    const provided = header?.startsWith("Bearer ") ? header.slice(7) : "";
    const providedBuffer = Buffer.from(provided);

    const matches =
      providedBuffer.length === expected.length &&
      timingSafeEqual(providedBuffer, expected);

    if (!matches) {
      throw new UnauthorizedError();
    }

    next();
  };
}
