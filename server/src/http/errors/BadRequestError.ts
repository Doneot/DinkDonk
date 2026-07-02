import { AppError } from "./AppError.js";

export class BadRequestError extends AppError {
  readonly statusCode = 400;
  readonly code = "validation_error";
  readonly error: Record<string, unknown>;

  constructor(message = "Bad Request", error: Record<string, unknown> = {}) {
    super(message);
    this.error = error;
  }
}
