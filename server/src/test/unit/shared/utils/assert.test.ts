import { describe, expect, it } from "vitest";

import { assertDefined } from "../../../../shared/utils/assert.js";

describe("assertDefined", () => {
  it("returns the value when it is defined", () => {
    expect(assertDefined("value", "name")).toBe("value");
  });

  it.each([
    ["falsy but defined", 0],
    ["empty string", ""],
    ["false", false],
  ])("passes through %s values", (_label, value) => {
    expect(assertDefined(value, "name")).toBe(value);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
  ])("throws a named error for %s", (_label, value) => {
    // No cast needed: assertDefined's type signature accepts `T | null |
    // undefined`, matching what it actually checks at runtime.
    expect(() => assertDefined<string>(value, "Token")).toThrow(
      "Missing value: Token",
    );
  });
});
