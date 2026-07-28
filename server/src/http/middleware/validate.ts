import type { Request, RequestHandler } from "express";
import { z } from "zod";
import type { ZodTypeAny } from "zod";
import { BadRequestError } from "../errors/BadRequestError.js";

function validate<TSchema extends ZodTypeAny>(
  schema: TSchema,
  source: "body" | "query",
): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      throw new BadRequestError("Bad Request", z.treeifyError(result.error));
    }

    req.validated[source] = result.data;

    next();
  };
}

export function validateBody<TSchema extends ZodTypeAny>(
  schema: TSchema,
): RequestHandler {
  return validate(schema, "body");
}

export function validateQuery<TSchema extends ZodTypeAny>(
  schema: TSchema,
): RequestHandler {
  return validate(schema, "query");
}

function validated<T>(value: unknown): T {
  return value as T;
}

export function validatedBody<T>(req: Request): T {
  return validated(req.validated.body);
}

export function validatedQuery<T>(req: Request): T {
  return validated(req.validated.query);
}

export const initializeValidatedRequest: RequestHandler = (req, _res, next) => {
  req.validated = {
    body: {},
    query: {},
  };

  next();
};
