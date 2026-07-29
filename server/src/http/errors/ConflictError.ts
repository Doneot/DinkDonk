import { AppError } from "./AppError.js";

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = "conflict";

  constructor(message = "Conflict", details?: Record<string, unknown>) {
    super(message, details);
  }
}
