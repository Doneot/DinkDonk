import { describe, expect, it } from "vitest";

import { AppError } from "../../../../http/errors/AppError.js";
import { BadRequestError } from "../../../../http/errors/BadRequestError.js";
import { NotFoundError } from "../../../../http/errors/NotFoundError.js";
import { UnauthorizedError } from "../../../../http/errors/UnauthorizedError.js";

describe("AppError subclasses", () => {
  it.each([
    [new BadRequestError(), 400, "validation_error", "Bad Request"],
    [new NotFoundError("streamer"), 404, "not_found", "streamer"],
    [new UnauthorizedError(), 401, "unauthorized", "Unauthorized"],
  ])(
    "%s carries its status, code and message",
    (error, status, code, message) => {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
      expect(error.statusCode).toBe(status);
      expect(error.code).toBe(code);
      expect(error.message).toBe(message);
    },
  );

  it("names each error after its own class", () => {
    expect(new BadRequestError().name).toBe("BadRequestError");
    expect(new NotFoundError("nope").name).toBe("NotFoundError");
    expect(new UnauthorizedError().name).toBe("UnauthorizedError");
  });

  it("accepts custom messages", () => {
    expect(new BadRequestError("Invalid JSON").message).toBe("Invalid JSON");
    expect(new UnauthorizedError("Session expired").message).toBe(
      "Session expired",
    );
  });

  it("omits BadRequestError details when none are given", () => {
    expect(new BadRequestError().details).toBeUndefined();
  });

  it("keeps BadRequestError validation details", () => {
    const details = { errors: ["streamerId is required"] };

    expect(new BadRequestError("Bad Request", details).details).toEqual(details);
  });
});
