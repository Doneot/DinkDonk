import { describe, expect, it, vi } from "vitest";

import { resolveIdentity } from "../../../../modules/auth/application/resolveIdentity.js";
import type { IdentityRepository } from "../../../../modules/auth/ports/IdentityRepository.js";
import { TokenDecryptionError } from "../../../../shared/utils/crypto.js";
import { logger } from "../../../../shared/logger/logger.js";
import { buildIdentity } from "../../../builders/auth.js";

function setup() {
  const getIdentity = vi.fn<IdentityRepository["getIdentity"]>();
  const repository = { getIdentity } as unknown as IdentityRepository;

  return { repository, getIdentity };
}

describe("resolveIdentity", () => {
  it("returns a found result for an existing identity", async () => {
    const { repository, getIdentity } = setup();
    const identity = buildIdentity();

    getIdentity.mockResolvedValue(identity);

    await expect(
      resolveIdentity(repository, identity.uid, "decrypt failed"),
    ).resolves.toEqual({ status: "found", identity });
  });

  it("returns not_found when the repository has no such identity", async () => {
    const { repository, getIdentity } = setup();

    getIdentity.mockResolvedValue(null);

    await expect(
      resolveIdentity(repository, "ghost", "decrypt failed"),
    ).resolves.toEqual({ status: "not_found" });
  });

  it("returns decryption_failed and logs a warning for a TokenDecryptionError", async () => {
    const warn = vi.spyOn(logger, "warn").mockReturnValue();
    const { repository, getIdentity } = setup();
    const error = new TokenDecryptionError(new Error("bad auth tag"));

    getIdentity.mockRejectedValue(error);

    await expect(
      resolveIdentity(repository, "user-1", "custom decrypt failure message"),
    ).resolves.toEqual({ status: "decryption_failed" });

    expect(warn).toHaveBeenCalledWith(
      { userId: "user-1", error },
      "custom decrypt failure message",
    );
  });

  it("rethrows an unexpected repository error", async () => {
    const { repository, getIdentity } = setup();
    const error = new Error("firestore unavailable");

    getIdentity.mockRejectedValue(error);

    await expect(
      resolveIdentity(repository, "user-1", "decrypt failed"),
    ).rejects.toThrow(error);
  });
});
