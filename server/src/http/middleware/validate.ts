import type { Request, RequestHandler } from "express";
import { z } from "zod";
import type { ZodTypeAny } from "zod";

import { BadRequestError } from "../errors/BadRequestError.js";

type ValidatedSource = "body" | "query";

// Tracks which of req.validated.{body,query} were actually populated by
// validateBody/validateQuery running on this request, as opposed to still
// holding initializeValidatedRequest's empty-object default. Keyed on the
// request object itself so it doesn't need a new field on Express's Request
// type and is automatically garbage-collected with the request.
const validatedSources = new WeakMap<Request, Set<ValidatedSource>>();

function validate<TSchema extends ZodTypeAny>(
  schema: TSchema,
  source: ValidatedSource,
): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      throw new BadRequestError("Bad Request", z.treeifyError(result.error));
    }

    req.validated[source] = result.data;

    let sources = validatedSources.get(req);

    if (!sources) {
      sources = new Set();
      validatedSources.set(req, sources);
    }

    sources.add(source);

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

function validated<T>(req: Request, source: ValidatedSource): T {
  if (!validatedSources.get(req)?.has(source)) {
    // A route handler calling validatedBody/validatedQuery without the
    // corresponding validateBody/validateQuery middleware in front of it is
    // a programming error, not a client error: without this check it would
    // silently return {} cast as T instead of failing loudly.
    throw new Error(
      `validated${source === "body" ? "Body" : "Query"}() called but ` +
        `validate${source === "body" ? "Body" : "Query"}() never ran for this request`,
    );
  }

  return req.validated[source] as T;
}

export function validatedBody<T>(req: Request): T {
  return validated(req, "body");
}

export function validatedQuery<T>(req: Request): T {
  return validated(req, "query");
}

export const initializeValidatedRequest: RequestHandler = (req, _res, next) => {
  req.validated = {
    body: {},
    query: {},
  };

  validatedSources.delete(req);

  next();
};
