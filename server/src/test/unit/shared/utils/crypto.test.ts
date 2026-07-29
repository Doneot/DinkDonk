import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decryptSecret,
  encryptSecret,
  TokenDecryptionError,
} from "../../../../shared/utils/crypto.js";

/**
 * `env` (and crypto.ts's key cache derived from it) is a module singleton
 * built at import time, so exercising a different ENCRYPTION_KEY requires
 * resetting the module registry and re-importing both against a patched
 * environment.
 */
async function loadCryptoWithKey(encryptionKey: string) {
  const snapshot = process.env.ENCRYPTION_KEY;

  process.env.ENCRYPTION_KEY = encryptionKey;

  vi.resetModules();

  try {
    return await import("../../../../shared/utils/crypto.js");
  } finally {
    process.env.ENCRYPTION_KEY = snapshot;
  }
}

afterEach(() => {
  vi.resetModules();
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext value", () => {
    const encrypted = encryptSecret("super-secret-token");

    expect(encrypted).not.toBe("super-secret-token");
    expect(encrypted.startsWith("enc:v1:")).toBe(true);
    expect(decryptSecret(encrypted)).toBe("super-secret-token");
  });

  it("produces a different ciphertext for the same plaintext each time", () => {
    const first = encryptSecret("token");
    const second = encryptSecret("token");

    expect(first).not.toBe(second);
    expect(decryptSecret(first)).toBe("token");
    expect(decryptSecret(second)).toBe("token");
  });

  it("returns legacy plaintext values unchanged (no version prefix)", () => {
    expect(decryptSecret("a-plaintext-access-token")).toBe(
      "a-plaintext-access-token",
    );
  });

  it("returns the original value unchanged if it looks tampered/malformed", () => {
    const malformed = "enc:v1:not-enough-parts";

    expect(decryptSecret(malformed)).toBe(malformed);
  });

  it("supports key rotation: a value encrypted under an old key still decrypts once a new key is prepended", async () => {
    const oldKey = "old-key-32-bytes-long-aaaaaaaaaaaa";
    const newKey = "new-key-32-bytes-long-bbbbbbbbbbbb";

    const withOldKey = await loadCryptoWithKey(oldKey);
    const encryptedUnderOldKey = withOldKey.encryptSecret("a-token");

    const withBothKeys = await loadCryptoWithKey(`${newKey},${oldKey}`);

    expect(withBothKeys.decryptSecret(encryptedUnderOldKey)).toBe("a-token");
  });

  it("encrypts new values under the first (current) key once rotated", async () => {
    const oldKey = "old-key-32-bytes-long-aaaaaaaaaaaa";
    const newKey = "new-key-32-bytes-long-bbbbbbbbbbbb";

    const withBothKeys = await loadCryptoWithKey(`${newKey},${oldKey}`);
    const encrypted = withBothKeys.encryptSecret("a-token");

    // Decryptable with only the new key present - proves it wasn't encrypted
    // under the old one.
    const withNewKeyOnly = await loadCryptoWithKey(newKey);

    expect(withNewKeyOnly.decryptSecret(encrypted)).toBe("a-token");
  });

  it("throws a TokenDecryptionError when no configured key can decrypt the value", async () => {
    const withOldKey = await loadCryptoWithKey(
      "old-key-32-bytes-long-aaaaaaaaaaaa",
    );
    const encrypted = withOldKey.encryptSecret("a-token");

    const withUnrelatedKey = await loadCryptoWithKey(
      "unrelated-key-32-bytes-long-cccccc",
    );

    expect(() => withUnrelatedKey.decryptSecret(encrypted)).toThrow(
      withUnrelatedKey.TokenDecryptionError,
    );
  });

  it("throws a TokenDecryptionError when the ciphertext or auth tag has been tampered with", () => {
    const encrypted = encryptSecret("token");
    const [enc, v1, iv, tag, data] = encrypted.split(":");
    const tamperedData = Buffer.from(`${data}`, "base64")
      .reverse()
      .toString("base64");
    const tampered = [enc, v1, iv, tag, tamperedData].join(":");

    expect(() => decryptSecret(tampered)).toThrow(TokenDecryptionError);
  });
});
