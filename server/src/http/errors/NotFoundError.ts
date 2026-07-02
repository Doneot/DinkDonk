import { AppError } from "./AppError.js";

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = "not_found";

  constructor(message: string) {
    super(message);
  }
}
