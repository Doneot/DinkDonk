import { describe, expect, it } from "vitest";
import { z } from "zod";

import { BadRequestError } from "../../../../http/errors/BadRequestError.js";
import {
  initializeValidatedRequest,
  validateBody,
  validateParams,
  validateQuery,
  validatedBody,
  validatedParams,
  validatedQuery,
} from "../../../../http/middleware/validate.js";

import {
  createMockRequest,
  createMockResponse,
  createNext,
} from "../../../helpers/express.js";

import { anyString, arrayContaining } from "../../../helpers/matchers.js";

const schema = z.object({
  name: z.string().trim().min(1),
});

describe("initializeValidatedRequest", () => {
  it("installs empty validated containers", () => {
    const req = createMockRequest();
    const next = createNext();

    initializeValidatedRequest(req, createMockResponse(), next);

    expect(req.validated).toEqual({ body: {}, query: {}, params: {} });
    expect(next.calls).toEqual([undefined]);
  });
});

describe.each([
  ["body", validateBody, validatedBody],
  ["query", validateQuery, validatedQuery],
  ["params", validateParams, validatedParams],
] as const)("validate%s", (source, factory, read) => {
  const middleware = factory(schema);

  it(`stores the parsed ${source} and continues`, () => {
    const req = createMockRequest({ [source]: { name: "  Streamer  " } });
    const next = createNext();

    middleware(req, createMockResponse(), next);

    expect(req.validated[source]).toEqual({ name: "Streamer" });
    expect(read<{ name: string }>(req)).toEqual({ name: "Streamer" });
    expect(next.calls).toEqual([undefined]);
  });

  it(`throws a BadRequestError with details for an invalid ${source}`, () => {
    const req = createMockRequest({ [source]: { name: "" } });
    const next = createNext();

    let thrown: unknown;

    try {
      middleware(req, createMockResponse(), next);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestError);
    expect((thrown as BadRequestError).error).toMatchObject({
      properties: {
        name: { errors: arrayContaining([anyString]) },
      },
    });
    expect(next.calls).toHaveLength(0);
  });

  it(`does not touch the other validated containers for ${source}`, () => {
    const req = createMockRequest({ [source]: { name: "Streamer" } });

    middleware(req, createMockResponse(), createNext());

    const untouched = (["body", "query", "params"] as const).filter(
      (key) => key !== source,
    );

    for (const key of untouched) {
      expect(req.validated[key]).toEqual({});
    }
  });
});
