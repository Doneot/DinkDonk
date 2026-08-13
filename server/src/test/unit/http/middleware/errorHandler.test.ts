import { afterEach, describe, expect, it, vi } from "vitest";

import { BadRequestError } from "../../../../http/errors/BadRequestError.js";
import { NotFoundError } from "../../../../http/errors/NotFoundError.js";
import { UnauthorizedError } from "../../../../http/errors/UnauthorizedError.js";
import { errorHandler } from "../../../../http/middleware/errorHandler.js";
import { env } from "../../../../shared/config/env.js";
import { logger } from "../../../../shared/logger/logger.js";
import { TokenDecryptionError } from "../../../../shared/utils/crypto.js";
import {
  createMockRequest,
  createMockResponse,
  createNext,
} from "../../../helpers/express.js";

function handle(error: Error, req = createMockRequest()) {
  const res = createMockResponse();

  errorHandler(error, req, res, createNext());

  return res;
}

afterEach(() => {
  env.isProduction = false;
  vi.restoreAllMocks();
});

describe("errorHandler", () => {
  it("maps an AppError to its status code and payload", () => {
    const warn = vi.spyOn(logger, "warn").mockReturnValue();

    const res = handle(new NotFoundError("streamer"));

    expect(res.statusCode).toBe(404);
    expect(res.jsonBody).toEqual({
      error: "not_found",
      message: "streamer",
    });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("includes validation details for errors that carry them", () => {
    vi.spyOn(logger, "warn").mockReturnValue();

    const details = { errors: ["streamerId is required"] };

    const res = handle(new BadRequestError("Bad Request", details));

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "validation_error",
      message: "Bad Request",
      details,
    });
  });

  it("omits details for AppErrors without them", () => {
    vi.spyOn(logger, "warn").mockReturnValue();

    const res = handle(new UnauthorizedError());

    expect(res.jsonBody).toEqual({
      error: "unauthorized",
      message: "Unauthorized",
    });
  });

  it("logs validation details alongside the request context", () => {
    const warn = vi.spyOn(logger, "warn").mockReturnValue();

    const details = { errors: ["streamerId is required"] };

    handle(new BadRequestError("Bad Request", details));

    expect(warn.mock.calls[0]?.[0]).toMatchObject({ details });
  });

  it("omits details from the log for AppErrors without them", () => {
    const warn = vi.spyOn(logger, "warn").mockReturnValue();

    handle(new UnauthorizedError());

    expect(warn.mock.calls[0]?.[0]).toMatchObject({ details: undefined });
  });

  it("logs a user out gracefully with a 401 when stored tokens can't be decrypted", () => {
    const warn = vi.spyOn(logger, "warn").mockReturnValue();

    const res = handle(new TokenDecryptionError(new Error("bad auth tag")));

    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toEqual({
      error: "unauthorized",
      message: "Unauthorized",
    });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("passes through a framework error's own 4xx status instead of flattening it to 500", () => {
    const warn = vi.spyOn(logger, "warn").mockReturnValue();

    // Mirrors what body-parser's JSON middleware throws for malformed JSON:
    // a plain http-errors instance (not AppError) carrying a real status.
    const error = Object.assign(new SyntaxError("Unexpected token h in JSON"), {
      status: 400,
      expose: true,
    });

    const res = handle(error);

    expect(res.statusCode).toBe(400);
    // The raw framework message ("Unexpected token h in JSON") isn't sent to
    // the client - only a generic, controlled message is - but it's still
    // captured in the log context (asserted separately below).
    expect(res.jsonBody).toEqual({
      error: "bad_request",
      message: "Bad Request",
    });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      message: "Unexpected token h in JSON",
    });
  });

  it("reads a framework error's status from statusCode when status is absent", () => {
    vi.spyOn(logger, "warn").mockReturnValue();

    const error = Object.assign(new Error("Payload Too Large"), {
      statusCode: 413,
    });

    const res = handle(error);

    expect(res.statusCode).toBe(413);
    expect(res.jsonBody).toMatchObject({ error: "payload_too_large" });
  });

  it("still falls back to a generic 500 for a framework error outside the 4xx range", () => {
    const error = vi.spyOn(logger, "error").mockReturnValue();

    const res = handle(Object.assign(new Error("boom"), { status: 502 }));

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody).toEqual({
      error: "internal_server_error",
      message: "Unexpected error",
    });
    expect(error).toHaveBeenCalledOnce();
  });

  it("hides unexpected errors behind a generic 500", () => {
    const error = vi.spyOn(logger, "error").mockReturnValue();

    const res = handle(new Error("database exploded"));

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody).toEqual({
      error: "internal_server_error",
      message: "Unexpected error",
    });
    expect(error).toHaveBeenCalledOnce();
  });

  it("logs request context including the authenticated user", () => {
    const warn = vi.spyOn(logger, "warn").mockReturnValue();

    handle(
      new UnauthorizedError(),
      createMockRequest({
        method: "POST",
        originalUrl: "/api/subscriptions",
        requestId: "req-1",
        user: { id: "user-1" } as Express.User,
      }),
    );

    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      requestId: "req-1",
      route: "/api/subscriptions",
      method: "POST",
      userId: "user-1",
      errorName: "UnauthorizedError",
    });
  });

  it("keeps stack traces out of production logs", () => {
    const error = vi.spyOn(logger, "error").mockReturnValue();

    env.isProduction = true;

    handle(new Error("boom"));

    expect(error.mock.calls[0]?.[0]).toMatchObject({ stack: undefined });
  });

  it("keeps stack traces in non-production logs", () => {
    const error = vi.spyOn(logger, "error").mockReturnValue();

    handle(new Error("boom"));

    const context = error.mock.calls[0]?.[0] as { stack?: string };

    expect(context.stack).toContain("Error: boom");
  });
});
