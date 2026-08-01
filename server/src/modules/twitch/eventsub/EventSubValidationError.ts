/**
 * Malformed EventSub payload/headers/JSON - a protocol-level validation
 * failure, not an HTTP concern. Kept independent of AppError/BadRequestError
 * so this dispatch/parsing logic stays usable outside an Express request
 * (e.g. a queued replay or CLI backfill tool); the HTTP route is responsible
 * for translating this into a BadRequestError at its own boundary.
 */
export class EventSubValidationError extends Error {
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "EventSubValidationError";

    if (details !== undefined) {
      this.details = details;
    }
  }
}
