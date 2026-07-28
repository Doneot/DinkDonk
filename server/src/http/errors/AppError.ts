export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;

  /** Extra structured context (e.g. validation issues) to include in the response. */
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;

    if (details !== undefined) {
      this.details = details;
    }
  }
}
