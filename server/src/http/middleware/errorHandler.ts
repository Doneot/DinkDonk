import { STATUS_CODES } from "node:http";

import { logger } from "../../shared/logger/logger.js";

import type {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";

import { AppError } from "../errors/AppError.js";
import { env } from "../../shared/config/env.js";
import { TokenDecryptionError } from "../../shared/utils/crypto.js";

function errorLogContext(error: Error, req: Request): Record<string, unknown> {
  return {
    requestId: req.requestId,
    route: req.originalUrl,
    method: req.method,
    userId: req.user?.id,
    errorName: error.name,
    message: error.message,
    details: error instanceof AppError ? error.details : undefined,
    stack: env.isProduction ? undefined : error.stack,
  };
}

function toErrorCode(statusCode: number): string {
  return (STATUS_CODES[statusCode] ?? "Error")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Framework middleware (body-parser's JSON/urlencoded parsers, `raw-body`,
 * etc.) throws plain `http-errors` instances - not AppError - but still sets
 * a genuine 4xx `status`/`statusCode` (malformed JSON, payload too large,
 * unsupported content-type...). Without this, those errors fell through to
 * the generic 500 branch below, hiding a client mistake behind an "internal"
 * error and dropping the specific status code the framework already knew.
 */
function frameworkClientErrorStatus(error: Error): number | undefined {
  const status =
    (error as { status?: unknown }).status ??
    (error as { statusCode?: unknown }).statusCode;

  return typeof status === "number" && status >= 400 && status < 500
    ? status
    : undefined;
}

export const errorHandler: ErrorRequestHandler = (
  error: Error,
  req: Request,
  res: Response,
  _: NextFunction,
) => {
  if (error instanceof AppError) {
    logger.warn(errorLogContext(error, req), "Handled request error");

    const payload: Record<string, unknown> = {
      error: error.code,
      message: error.message,
    };

    if (error.details !== undefined) {
      payload.details = error.details;
    }

    return res.status(error.statusCode).json(payload);
  }

  // Same intent as passport.ts's deserializeUser: a rotated or corrupted
  // encryption key means this session's stored tokens can no longer be
  // trusted, so log it out gracefully (401) instead of leaking the decrypt
  // failure to the client as a generic 500.
  if (error instanceof TokenDecryptionError) {
    logger.warn(errorLogContext(error, req), "Handled token decryption error");

    return res.status(401).json({
      error: "unauthorized",
      message: "Unauthorized",
    });
  }

  const frameworkStatusCode = frameworkClientErrorStatus(error);

  if (frameworkStatusCode !== undefined) {
    logger.warn(errorLogContext(error, req), "Handled framework request error");

    // error.message here is whatever the framework/underlying parser put on
    // the exception (e.g. body-parser's raw JSON parse error text) - unlike
    // the AppError branch above, it isn't a message this codebase authored
    // for client consumption, so it's not sent as-is. The real message is
    // still captured in errorLogContext above for debugging.
    return res.status(frameworkStatusCode).json({
      error: toErrorCode(frameworkStatusCode),
      message: STATUS_CODES[frameworkStatusCode] ?? "Request Error",
    });
  }

  logger.error(errorLogContext(error, req), "Unhandled request error");

  return res.status(500).json({
    error: "internal_server_error",
    message: "Unexpected error",
  });
};
