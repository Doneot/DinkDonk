/**
 * A provider account (e.g. Discord) is already linked to a different uid
 * than the one being linked onto - a domain-level invariant violation, not
 * an HTTP concern. Kept independent of ConflictError/AppError so this
 * repository doesn't depend on the HTTP transport layer; the caller (e.g.
 * passport.ts's verify callback) is responsible for translating this into a
 * ConflictError at its own boundary.
 */
export class IdentityConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityConflictError";
  }
}
