import api from "./client";

// Field caps mirror the backend's clientErrorReportSchema
// (server/src/http/schemas/clientErrors.ts) - trimming here too means a
// caller sees the same bound locally instead of learning about it from a
// 400 response for a report it was trying to send about a different error.
const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 8000;

/**
 * Forwards a caught frontend error to the backend's structured-logging
 * pipeline (POST /api/client-errors -> pino -> Grafana), so a production
 * render error or failed background fetch is visible somewhere other than
 * the affected user's own browser console. Deliberately fire-and-forget:
 * error reporting must never itself throw and mask (or replace) the error
 * it's reporting, so any failure here is swallowed, not surfaced.
 */
export function reportClientError(
  error: unknown,
  context: string,
  extra: { componentStack?: string } = {},
): void {
  const message =
    (error instanceof Error ? error.message : String(error)).slice(
      0,
      MAX_MESSAGE_LENGTH,
    ) || "Unknown error";

  const stack =
    error instanceof Error && error.stack
      ? error.stack.slice(0, MAX_STACK_LENGTH)
      : undefined;

  api
    .post("/client-errors", {
      message,
      stack,
      componentStack: extra.componentStack?.slice(0, MAX_STACK_LENGTH),
      context,
      url: window.location.pathname,
    })
    .catch(() => {
      // Nothing useful to do if the report itself fails to send (offline,
      // backend unreachable) - the original error is already logged to the
      // console by the caller regardless of this call's outcome.
    });
}
