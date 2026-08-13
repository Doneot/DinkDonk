import { logger } from "../../../shared/logger/logger.js";
import { TokenDecryptionError } from "../../../shared/utils/crypto.js";
import type { Identity } from "../domain/Identity.js";
import type { IdentityRepository } from "../ports/IdentityRepository.js";

export type IdentityResolution =
  | { status: "found"; identity: Identity }
  | { status: "not_found" }
  | { status: "decryption_failed" };

/**
 * Resolves a session/socket's identity, classifying a corrupted or rotated
 * encryption key (TokenDecryptionError) as its own outcome rather than an
 * unexpected failure - shared by passport.ts's deserializeUser and
 * socketServer.ts's connection handshake so this "what makes a session
 * invalid" decision can't drift between the two independently. Any other
 * error is rethrown for the caller to handle according to its own policy
 * (an HTTP request vs. a socket handshake fail very differently). Callers
 * that don't need to distinguish "not_found" from "decryption_failed" (e.g.
 * socketServer.ts, which disconnects either way) can treat anything other
 * than "found" as invalid.
 */
export async function resolveIdentity(
  repository: IdentityRepository,
  uid: string,
  decryptFailureMessage: string,
): Promise<IdentityResolution> {
  try {
    const identity = await repository.getIdentity(uid);

    return identity ? { status: "found", identity } : { status: "not_found" };
  } catch (error) {
    if (error instanceof TokenDecryptionError) {
      logger.warn({ userId: uid, error }, decryptFailureMessage);

      return { status: "decryption_failed" };
    }

    throw error;
  }
}
