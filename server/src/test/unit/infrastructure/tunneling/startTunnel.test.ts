import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Tunnel } from "../../../../infrastructure/tunneling/Tunnel.js";

type NgrokListener = { url: () => string | null; close: () => Promise<void> };

const forward = vi.fn<(options: unknown) => Promise<NgrokListener>>();
const close = vi.fn().mockResolvedValue(undefined);
const url = vi.fn<() => string | null>().mockReturnValue("https://tunnel.test");

const startSshTunnel = vi.fn<() => Promise<Tunnel>>();

vi.mock("@ngrok/ngrok", () => ({
  default: {
    forward: (options: unknown) => forward(options),
  },
}));

// Spawning a real ssh client would leak a process; only the dispatch is under
// test here, the ssh provider itself has its own suite.
vi.mock("../../../../infrastructure/tunneling/sshTunnel.js", () => ({
  startSshTunnel: () => startSshTunnel(),
}));

const { startTunnel } =
  await import("../../../../infrastructure/tunneling/index.js");
const { startNgrokTunnel } =
  await import("../../../../infrastructure/tunneling/ngrokTunnel.js");

beforeEach(() => {
  forward.mockReset().mockResolvedValue({ url, close });
  url.mockReset().mockReturnValue("https://tunnel.test");
  close.mockClear();
  startSshTunnel.mockReset().mockResolvedValue({
    url: "https://ssh-tunnel.test",
    stop: vi.fn(),
  });
});

describe("startNgrokTunnel", () => {
  it("forwards the local port using the configured auth token", async () => {
    const tunnel = await startNgrokTunnel();

    expect(forward.mock.calls[0]?.[0]).toEqual({
      addr: 3000,
      authtoken: "ngrok-auth-token",
    });
    expect(tunnel.url).toBe("https://tunnel.test");
  });

  it("closes the listener on stop", async () => {
    const tunnel = await startNgrokTunnel();

    await tunnel.stop();

    expect(close).toHaveBeenCalledOnce();
  });

  it("fails when ngrok returns no public url", async () => {
    url.mockReturnValue(null);

    await expect(startNgrokTunnel()).rejects.toThrow(
      "Failed to create ngrok tunnel",
    );
  });
});

describe("startTunnel", () => {
  it("starts an ngrok tunnel", async () => {
    const tunnel = await startTunnel("ngrok");

    expect(tunnel.url).toBe("https://tunnel.test");
    expect(forward).toHaveBeenCalledOnce();
  });

  it("starts an ssh tunnel", async () => {
    const tunnel = await startTunnel("ssh");

    expect(tunnel.url).toBe("https://ssh-tunnel.test");
    expect(forward).not.toHaveBeenCalled();
  });
});
