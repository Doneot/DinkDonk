import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../../../../shared/config/env.js";
import { logger } from "../../../../shared/logger/logger.js";

type KillCallback = (error?: Error) => void;

type FakeChildProcess = EventEmitter & { pid: number | undefined };

const spawn = vi.fn<() => FakeChildProcess>();
const kill =
  vi.fn<(pid: number, signal: string, callback: KillCallback) => void>();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawn(...(args as [])),
}));

vi.mock("tree-kill", () => ({
  default: (pid: number, signal: string, callback: KillCallback) =>
    kill(pid, signal, callback),
}));

const { startSshTunnel } =
  await import("../../../../infrastructure/tunneling/sshTunnel.js");

function createChildProcess(pid: number | undefined): FakeChildProcess {
  const child = new EventEmitter() as FakeChildProcess;

  child.pid = pid;

  return child;
}

/** Lets the tunnel's 750ms "did it stay up?" window elapse. */
async function settleStartupWindow(): Promise<void> {
  await vi.advanceTimersByTimeAsync(750);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(logger, "info").mockReturnValue();
  kill.mockReset().mockImplementation((_pid, _signal, callback) => callback());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  spawn.mockReset();
  env.port = 3000;
});

describe("startSshTunnel", () => {
  it("opens a reverse ssh tunnel and exposes the configured public url", async () => {
    spawn.mockReturnValue(createChildProcess(4321));

    const pending = startSshTunnel();

    await settleStartupWindow();

    const tunnel = await pending;

    expect(spawn.mock.calls[0]).toEqual([
      "ssh",
      [
        "-N",
        "-o",
        "ExitOnForwardFailure=yes",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        "-R",
        "9000:localhost:3000",
        "dinkdonk-vps",
      ],
      { stdio: "inherit" },
    ]);
    expect(tunnel.url).toBe("http://localhost:4000");
  });

  it("forwards to the configured server port instead of a hardcoded one", async () => {
    env.port = 8080;

    spawn.mockReturnValue(createChildProcess(4321));

    const pending = startSshTunnel();

    await settleStartupWindow();

    await pending;

    expect(spawn.mock.calls[0]).toEqual([
      "ssh",
      [
        "-N",
        "-o",
        "ExitOnForwardFailure=yes",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        "-R",
        "9000:localhost:8080",
        "dinkdonk-vps",
      ],
      { stdio: "inherit" },
    ]);
  });

  it("fails when ssh exits during the startup window", async () => {
    const child = createChildProcess(4321);

    spawn.mockReturnValue(child);

    const pending = startSshTunnel();

    child.emit("exit", 255);

    await expect(pending).rejects.toThrow("SSH tunnel exited (255)");
  });

  it("fails when ssh cannot be spawned", async () => {
    const child = createChildProcess(4321);

    spawn.mockReturnValue(child);

    const pending = startSshTunnel();

    child.emit("error", new Error("spawn ssh ENOENT"));

    await expect(pending).rejects.toThrow("spawn ssh ENOENT");
  });

  it("kills the process tree on stop", async () => {
    spawn.mockReturnValue(createChildProcess(4321));

    const pending = startSshTunnel();

    await settleStartupWindow();

    await (await pending).stop();

    expect(kill.mock.calls[0]?.[0]).toBe(4321);
    expect(kill.mock.calls[0]?.[1]).toBe("SIGTERM");
  });

  it("does not kill a process that already exited", async () => {
    const child = createChildProcess(4321);

    spawn.mockReturnValue(child);

    const pending = startSshTunnel();

    await settleStartupWindow();

    const tunnel = await pending;

    child.emit("exit", 0);

    await tunnel.stop();

    expect(kill).not.toHaveBeenCalled();
  });

  it("does not kill when the process has no pid", async () => {
    spawn.mockReturnValue(createChildProcess(undefined));

    const pending = startSshTunnel();

    await settleStartupWindow();

    await (await pending).stop();

    expect(kill).not.toHaveBeenCalled();
  });
});
