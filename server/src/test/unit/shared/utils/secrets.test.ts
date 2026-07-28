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

const { envOrSecret } = await import("../../../../shared/utils/secrets.js");

afterEach(() => {
  vi.resetAllMocks();
});

describe("envOrSecret", () => {
  it("prefers the given value and never touches the filesystem", () => {
    expect(envOrSecret("from-env", "session_secret")).toBe("from-env");
    expect(existsSync).not.toHaveBeenCalled();
  });

  it("falls back to the named docker secret file when the value is missing", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue("  from-secret\n");

    expect(envOrSecret(undefined, "session_secret")).toBe("from-secret");
    expect(existsSync).toHaveBeenCalledWith("/run/secrets/session_secret");
  });

  it("returns undefined when neither the value nor the secret exists", () => {
    existsSync.mockReturnValue(false);

    expect(envOrSecret(undefined, "session_secret")).toBeUndefined();
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it("falls back to the secret file when the value is an empty string", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue("from-secret");

    expect(envOrSecret("", "session_secret")).toBe("from-secret");
  });
});
