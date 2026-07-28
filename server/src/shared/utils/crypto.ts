import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const PREFIX = "enc:v1:";

let cachedKey: Buffer | undefined;

function getKey(): Buffer {
  cachedKey ??= scryptSync(env.encryptionKey, "dinkdonk-token-encryption", 32);

  return cachedKey;
}

/**
 * Encrypts a secret (e.g. an OAuth access/refresh token) for storage at rest.
 * The output is tagged with a version prefix so `decryptSecret` can tell it
 * apart from values written before encryption was introduced.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

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

  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivPart, "base64"),
  );

  decipher.setAuthTag(Buffer.from(tagPart, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
