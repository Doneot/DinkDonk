import { describe, expect, it } from "vitest";

import { normalizeTwitchLogin } from "../../../../modules/twitch/infrastructure/normalizeTwitchLogin.js";

describe("normalizeTwitchLogin", () => {
  it("trims and lowercases a login", () => {
    expect(normalizeTwitchLogin("  StreamerName  ")).toBe("streamername");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeTwitchLogin("   ")).toBe("");
  });
});
