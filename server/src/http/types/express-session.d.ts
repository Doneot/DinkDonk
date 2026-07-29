import "express-session";

declare module "express-session" {
  interface SessionData {
    canReceiveDM?: boolean;
    /**
     * Set right before redirecting into the Discord OAuth flow from an
     * authenticated "Connect Discord" button, so the strategy's verify
     * callback can tell a linking round trip apart from a fresh login/signup
     * and merge the resulting credential onto this uid instead of resolving
     * an account by matching verified email. Paired with
     * linkDiscordUidExpiresAt so an *abandoned* round trip (redirected to
     * Discord, never came back) can't linger for the rest of the session's
     * 30-day lifetime and silently turn some later, unrelated Discord login
     * attempt in the same browser into a link.
     */
    linkDiscordUid?: string;
    linkDiscordUidExpiresAt?: number;
    passport?: {
      user?: {
        id?: string;
      };
    };
  }
}
