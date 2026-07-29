import "express-session";

declare module "express-session" {
  interface SessionData {
    canReceiveDM?: boolean;
    /**
     * Set right before redirecting into the Discord OAuth flow from an
     * authenticated "Connect Discord" button, so the strategy's verify
     * callback can tell a linking round trip apart from a fresh login/signup
     * and merge the resulting credential onto this uid instead of resolving
     * an account by matching verified email.
     */
    linkDiscordUid?: string;
    passport?: {
      user?: {
        id?: string;
      };
    };
  }
}
