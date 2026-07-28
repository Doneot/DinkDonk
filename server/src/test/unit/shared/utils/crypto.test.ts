import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "../../../../shared/utils/crypto.js";

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

  it("throws when the ciphertext or auth tag has been tampered with", () => {
    const encrypted = encryptSecret("token");
    const [enc, v1, iv, tag, data] = encrypted.split(":");
    const tamperedData = Buffer.from(`${data}`, "base64")
      .reverse()
      .toString("base64");
    const tampered = [enc, v1, iv, tag, tamperedData].join(":");

    expect(() => decryptSecret(tampered)).toThrow();
  });
});
