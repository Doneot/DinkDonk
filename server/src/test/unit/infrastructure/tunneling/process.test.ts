import { afterEach, describe, expect, it, vi } from "vitest";

type KillCallback = (error?: Error & { code?: number }) => void;

const kill =
  vi.fn<(pid: number, signal: string, callback: KillCallback) => void>();

vi.mock("tree-kill", () => ({
  default: (pid: number, signal: string, callback: KillCallback) =>
    kill(pid, signal, callback),
}));

const { killProcessTree } =
  await import("../../../../infrastructure/tunneling/process.js");

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform });
}

afterEach(() => {
  setPlatform(originalPlatform);
  kill.mockReset();
});

describe("killProcessTree", () => {
  it("resolves without killing anything when there is no pid", async () => {
    await expect(killProcessTree(undefined)).resolves.toBeUndefined();

    expect(kill).not.toHaveBeenCalled();
  });

  it("resolves without killing anything for pid 0", async () => {
    await expect(killProcessTree(0)).resolves.toBeUndefined();

    expect(kill).not.toHaveBeenCalled();
  });

  it("sends SIGTERM by default", async () => {
    kill.mockImplementation((_pid, _signal, callback) => callback());

    await expect(killProcessTree(1234)).resolves.toBeUndefined();

    expect(kill.mock.calls[0]?.[0]).toBe(1234);
    expect(kill.mock.calls[0]?.[1]).toBe("SIGTERM");
  });

  it("forwards an explicit signal", async () => {
    kill.mockImplementation((_pid, _signal, callback) => callback());

    await killProcessTree(1234, "SIGKILL");

    expect(kill.mock.calls[0]?.[1]).toBe("SIGKILL");
  });

  it("rejects when the kill fails", async () => {
    kill.mockImplementation((_pid, _signal, callback) =>
      callback(new Error("no such process")),
    );

    await expect(killProcessTree(1234)).rejects.toThrow("no such process");
  });

  it("treats a Windows exit code 128 as an already-dead process", async () => {
    setPlatform("win32");

    kill.mockImplementation((_pid, _signal, callback) =>
      callback(Object.assign(new Error("taskkill failed"), { code: 128 })),
    );

    await expect(killProcessTree(1234)).resolves.toBeUndefined();
  });

  it("still rejects other Windows failures", async () => {
    setPlatform("win32");

    kill.mockImplementation((_pid, _signal, callback) =>
      callback(Object.assign(new Error("access denied"), { code: 1 })),
    );

    await expect(killProcessTree(1234)).rejects.toThrow("access denied");
  });

  it("rejects a code 128 failure on other platforms", async () => {
    setPlatform("linux");

    kill.mockImplementation((_pid, _signal, callback) =>
      callback(Object.assign(new Error("kill failed"), { code: 128 })),
    );

    await expect(killProcessTree(1234)).rejects.toThrow("kill failed");
  });
});
