import { describe, expect, it } from "vitest";

import { keepAliveHttpsAgent } from "../../../../infrastructure/http/httpsAgent.js";

describe("keepAliveHttpsAgent", () => {
  it("enables connection reuse", () => {
    // `keepAlive` is set on the instance at runtime but isn't part of
    // @types/node's public Agent surface.
    expect((keepAliveHttpsAgent as unknown as { keepAlive: boolean }).keepAlive).toBe(
      true,
    );
  });
});
