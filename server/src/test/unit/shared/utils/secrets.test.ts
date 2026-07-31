import { afterEach, describe, expect, it, vi } from "vitest";

const readFileSync = vi.fn<(path: string, encoding: string) => string>();

vi.mock("fs", () => ({
  default: {
    readFileSync: (path: string, encoding: string) =>
      readFileSync(path, encoding),
  },
}));

// envSchema.js (pulled in transitively by setupEnv.ts's logger import) already
// imported the real, unmocked "fs" before this file's mock was registered;
// reset the module registry so the dynamic import below picks up the mock.
vi.resetModules();

const { envOrSecret } = await import("../../../../shared/utils/secrets.js");

function enoent(path: string) {
  return Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), {
    code: "ENOENT",
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("envOrSecret", () => {
  it("prefers the given value and never touches the filesystem", () => {
    expect(envOrSecret("from-env", "session_secret")).toBe("from-env");
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it("falls back to the named docker secret file when the value is missing", () => {
    readFileSync.mockReturnValue("  from-secret\n");

    expect(envOrSecret(undefined, "session_secret")).toBe("from-secret");
    expect(readFileSync).toHaveBeenCalledWith(
      "/run/secrets/session_secret",
      "utf8",
    );
  });

  it("returns undefined when neither the value nor the secret file exists", () => {
    readFileSync.mockImplementation(() => {
      throw enoent("/run/secrets/session_secret");
    });

    expect(envOrSecret(undefined, "session_secret")).toBeUndefined();
  });

  it("falls back to the secret file when the value is an empty string", () => {
    readFileSync.mockReturnValue("from-secret");

    expect(envOrSecret("", "session_secret")).toBe("from-secret");
  });

  // Distinguishes "the secret just isn't mounted" (expected, silent) from a
  // real failure (e.g. a permissions error on a mount that does exist),
  // and makes sure the latter surfaces the checked path so a misconfigured
  // Docker secret mount is diagnosable instead of just looking like a
  // missing required env var.
  it("throws with the checked path when the secret file exists but can't be read", () => {
    readFileSync.mockImplementation(() => {
      throw Object.assign(new Error("EACCES: permission denied"), {
        code: "EACCES",
      });
    });

    expect(() => envOrSecret(undefined, "session_secret")).toThrow(
      /\/run\/secrets\/session_secret/,
    );
  });
});
