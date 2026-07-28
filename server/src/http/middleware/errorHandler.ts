import { logger } from "../../shared/logger/logger.js";

import type {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";

import { AppError } from "../errors/AppError.js";
import { env } from "../../shared/config/env.js";

function errorLogContext(error: Error, req: Request): Record<string, unknown> {
  return {
    requestId: req.requestId,
    route: req.originalUrl,
    method: req.method,
    userId: req.user?.id,
    errorName: error.name,
    message: error.message,
    details: "error" in error ? error.error : undefined,
    stack: env.isProduction ? undefined : error.stack,
  };
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

    if ("error" in error) {
      payload.details = error.error;
    }

    return res.status(error.statusCode).json(payload);
  }

  logger.error(errorLogContext(error, req), "Unhandled request error");

  return res.status(500).json({
    error: "internal_server_error",
    message: "Unexpected error",
  });
};
