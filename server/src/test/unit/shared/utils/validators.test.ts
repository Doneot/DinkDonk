import { describe, expect, it } from "vitest";

import { isNonEmptyString } from "../../../../shared/utils/validators.js";

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
