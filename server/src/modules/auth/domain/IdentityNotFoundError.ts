/**
 * No identity document exists for a uid the caller expected to already be
 * backed by one (e.g. updating a credential on an identity that should have
 * been created at signup) - a domain-level invariant violation, not an HTTP
 * concern. Kept independent of NotFoundError/AppError so this repository
 * doesn't depend on the HTTP transport layer, matching IdentityConflictError.
 */
export class IdentityNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityNotFoundError";
  }
}
