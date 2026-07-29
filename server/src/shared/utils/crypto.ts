import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

import { env } from "../config/env.js";
import { assertDefined } from "./assert.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const PREFIX = "enc:v1:";

/**
 * Distinguishes a corrupt/undecryptable token from other kinds of failures
 * (e.g. a Firestore outage), so callers can react differently - a rotated or
 * corrupted encryption key should log the affected user out gracefully
 * rather than surface as a raw 500 on every request that touches their
 * session.
 */
export class TokenDecryptionError extends Error {
  constructor(cause: unknown) {
    super("Failed to decrypt stored token", { cause });
    this.name = "TokenDecryptionError";
  }
}

let cachedKeys: Buffer[] | undefined;

// ENCRYPTION_KEY is a comma-separated list (validated by envSchema): the
// first entry is the current key used for new encryptions, and every entry
// is a candidate when decrypting, to support rotating in a new key without
// breaking ciphertext written under the previous one.
function getKeys(): Buffer[] {
  cachedKeys ??= env.encryptionKey.map((key) =>
    scryptSync(key, "dinkdonk-token-encryption", 32),
  );

  return cachedKeys;
}

/**
 * Encrypts a secret (e.g. an OAuth access/refresh token) for storage at rest.
 * The output is tagged with a version prefix so `decryptSecret` can tell it
 * apart from values written before encryption was introduced.
 */
export function encryptSecret(plaintext: string): string {
  // envSchema guarantees at least one key.
  const currentKey = assertDefined(getKeys()[0], "encryption key");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, currentKey, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/**
 * Decrypts a value produced by `encryptSecret`. Values that don't carry the
 * `enc:v1:` prefix are assumed to be plaintext written before encryption was
 * introduced, and are returned unchanged so existing records keep working
 * until they're next rewritten (which re-encrypts them).
 */
export function decryptSecret(value: string): string {
  if (!value.startsWith(PREFIX)) {
    return value;
  }

  const [ivPart, tagPart, dataPart] = value.slice(PREFIX.length).split(":");

  if (!ivPart || !tagPart || !dataPart) {
    return value;
  }

  const iv = Buffer.from(ivPart, "base64");
  const authTag = Buffer.from(tagPart, "base64");
  const ciphertext = Buffer.from(dataPart, "base64");

  let lastError: unknown;

  for (const key of getKeys()) {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv);

      decipher.setAuthTag(authTag);

      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return plaintext.toString("utf8");
    } catch (error) {
      lastError = error;
    }
  }

  throw new TokenDecryptionError(lastError);
}
