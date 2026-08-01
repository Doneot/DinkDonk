import "express-session";
import type { Identity, SessionUser } from "../../modules/auth/domain/Identity.js";

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends SessionUser {}
  }
}

declare module "express-serve-static-core" {
  interface Request {
    requestId: string;

    validated: {
      body: unknown;
      query: unknown;
    };

    cookies: Record<string, string>;
    signedCookies: Record<string, string>;

    // Populated by passport.ts's deserializeUser (once per request, for any
    // authenticated request) so later middleware/handlers that also need
    // the full Identity record - not just the trimmed SessionUser on
    // req.user - can reuse this instead of re-fetching it from Firestore.
    // Undefined when deserialization hasn't run (no session / not yet
    // reached); null specifically means "ran, but no identity resolved".
    // A snapshot from the start of the request, not re-fetched afterward:
    // if ensureFreshToken (auth.ts) refreshes this user's Discord token
    // mid-request, this object's discord.accessToken/refreshToken/fetchTime
    // stay stale for the rest of the request. Fine today (nothing reads
    // those fields off req.identity - only discord.id, which refresh never
    // changes), but a future handler that needs the just-refreshed token
    // should re-fetch from the repository rather than trust this.
    identity?: Identity | null;
  }
}
