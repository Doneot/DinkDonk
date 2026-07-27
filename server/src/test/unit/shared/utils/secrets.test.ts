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

const { envOrSecret } = await import("../../../../shared/utils/secrets.js");

const ENV_NAME = "SECRETS_TEST_VALUE";

afterEach(() => {
  delete process.env[ENV_NAME];
  vi.resetAllMocks();
});

describe("envOrSecret", () => {
  it("prefers the environment variable and never touches the filesystem", () => {
    process.env[ENV_NAME] = "from-env";

    expect(envOrSecret(ENV_NAME)).toBe("from-env");
    expect(existsSync).not.toHaveBeenCalled();
  });

  it("falls back to the docker secret file derived from the env name", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue("  from-secret\n");

    expect(envOrSecret(ENV_NAME)).toBe("from-secret");
    expect(existsSync).toHaveBeenCalledWith("/run/secrets/secrets_test_value");
  });

  it("reads an explicitly named secret file", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue("custom");

    expect(envOrSecret(ENV_NAME, "custom_secret")).toBe("custom");
    expect(existsSync).toHaveBeenCalledWith("/run/secrets/custom_secret");
  });

  it("returns undefined when neither the env var nor the secret exists", () => {
    existsSync.mockReturnValue(false);

    expect(envOrSecret(ENV_NAME)).toBeUndefined();
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it("falls back to the secret file when the env var is empty", () => {
    process.env[ENV_NAME] = "";
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue("from-secret");

    expect(envOrSecret(ENV_NAME)).toBe("from-secret");
  });
});
