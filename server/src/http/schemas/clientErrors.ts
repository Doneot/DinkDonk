import { z } from "zod";

// Bounded well above any realistic React error message/stack (this is
// telemetry input from a browser we don't control, not a trusted internal
// value) so a pathological report can't grow the pino log line unboundedly
// - matched by the route's own express.json() body-size limit too, so an
// oversized payload is rejected before it ever reaches Zod.
const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 8000;

export const clientErrorReportSchema = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),

  stack: z.string().max(MAX_STACK_LENGTH).optional(),

  // React's componentStack (from ErrorBoundary.componentDidCatch's second
  // argument), when the report came from render rather than an async catch.
  componentStack: z.string().max(MAX_STACK_LENGTH).optional(),

  // A short, caller-supplied label for where this was caught (e.g.
  // "ErrorBoundary", "useSubscriptions.hydrateProfiles") - not a stack
  // trace, just enough to group reports by origin without re-parsing stacks.
  context: z.string().trim().min(1).max(200).optional(),

  // The page the error happened on. Deliberately just the path, not read
  // from the request itself - the browser knows what was in the address
  // bar, the server only knows this route's own URL.
  url: z.string().trim().max(2000).optional(),
});

export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;
