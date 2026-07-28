import { afterEach, describe, expect, it, vi } from "vitest";

const existsSync = vi.fn<(path: string) => boolean>();
const readFileSync = vi.fn<(path: string, encoding: string) => string>();

vi.mock("fs", () => ({
  default: {
    existsSync: (path: string) => existsSync(path),
    readFileSync: (path: string, encoding: string) =>
      readFileSync(path, encoding),
  },
}));

// envSchema.js (pulled in transitively by setupEnv.ts's logger import) already
// imported the real, unmocked "fs" before this file's mock was registered;
// reset the module registry so the dynamic import below picks up the mock.
vi.resetModules();

const { booleanFromEnv, numberFromEnv, secretFromEnv } = await import(
  "../../../../shared/config/envParsers.js"
);

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

describe("secretFromEnv", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("accepts the value when it is already present", () => {
    expect(secretFromEnv("session_secret").parse("session-secret")).toBe(
      "session-secret",
    );
    expect(existsSync).not.toHaveBeenCalled();
  });

  it("falls back to the named docker secret file when the value is missing", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue("from-secret\n");

    expect(secretFromEnv("session_secret").parse(undefined)).toBe(
      "from-secret",
    );
    expect(existsSync).toHaveBeenCalledWith("/run/secrets/session_secret");
  });

  it("rejects when neither the value nor the secret file is present", () => {
    existsSync.mockReturnValue(false);

    expect(() => secretFromEnv("session_secret").parse(undefined)).toThrow();
  });
});
