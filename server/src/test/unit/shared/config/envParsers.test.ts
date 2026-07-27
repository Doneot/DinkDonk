import { describe, expect, it } from "vitest";

import {
  booleanFromEnv,
  numberFromEnv,
} from "../../../../shared/config/envParsers.js";

describe("booleanFromEnv", () => {
  it.each(["1", "true", "TRUE", "yes", "Yes", "on", "ON"])(
    "parses %j as true",
    (value) => {
      expect(booleanFromEnv.parse(value)).toBe(true);
    },
  );

  it.each(["0", "false", "no", "off", "", "maybe"])(
    "parses %j as false",
    (value) => {
      expect(booleanFromEnv.parse(value)).toBe(false);
    },
  );

  it("defaults to false when the variable is absent", () => {
    expect(booleanFromEnv.parse(undefined)).toBe(false);
  });
});

describe("numberFromEnv", () => {
  it("coerces a numeric string", () => {
    expect(numberFromEnv(3000).parse("8080")).toBe(8080);
  });

  it("applies the default when the variable is absent", () => {
    expect(numberFromEnv(3000).parse(undefined)).toBe(3000);
  });

  it("rejects a non-numeric string", () => {
    expect(() => numberFromEnv(3000).parse("not-a-number")).toThrow();
  });
});
