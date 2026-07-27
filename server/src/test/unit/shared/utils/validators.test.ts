import { describe, expect, it } from "vitest";

import {
  isNonEmptyString,
  normalizeTwitchLogin,
} from "../../../../shared/utils/validators.js";

describe("isNonEmptyString", () => {
  it.each([
    ["a value", true],
    ["  padded  ", true],
    ["", false],
    ["   ", false],
    ["\n\t", false],
  ])("returns %j -> %s", (value, expected) => {
    expect(isNonEmptyString(value)).toBe(expected);
  });
});

describe("normalizeTwitchLogin", () => {
  it("trims and lowercases a login", () => {
    expect(normalizeTwitchLogin("  StreamerName  ")).toBe("streamername");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeTwitchLogin("   ")).toBe("");
  });
});
