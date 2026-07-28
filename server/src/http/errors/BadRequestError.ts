import { AppError } from "./AppError.js";

export class BadRequestError extends AppError {
  readonly statusCode = 400;
  readonly code = "validation_error";

  constructor(message = "Bad Request", details: Record<string, unknown> = {}) {
    super(message, details);
  }
}
