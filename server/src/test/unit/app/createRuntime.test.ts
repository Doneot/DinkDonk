import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Tunnel } from "../../../infrastructure/tunneling/Tunnel.js";
import { env } from "../../../shared/config/env.js";

const stop = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

const startTunnel = vi
  .fn<(provider: "ngrok" | "ssh") => Promise<Tunnel>>()
  .mockResolvedValue({ url: "https://tunnel.test", stop });

vi.mock("../../../infrastructure/tunneling/index.js", () => ({
  startTunnel: (provider: "ngrok" | "ssh") => startTunnel(provider),
}));

const { createRuntime } = await import("../../../app/runtime/createRuntime.js");

beforeEach(() => {
  startTunnel
    .mockClear()
    .mockResolvedValue({ url: "https://tunnel.test", stop });
  stop.mockClear();
});

afterEach(() => {
  env.isProduction = false;
  env.tunneling.provider = "ngrok";
});

describe("createRuntime", () => {
  it("serves traffic on the public server url in production", async () => {
    env.isProduction = true;

    const runtime = await createRuntime();

    expect(runtime.publicUrl).toBe(env.serverUrl);
    expect(startTunnel).not.toHaveBeenCalled();

    await expect(runtime.dispose()).resolves.toBeUndefined();
  });

  it("opens a tunnel with the configured provider outside production", async () => {
    env.tunneling.provider = "ssh";

    const runtime = await createRuntime();

    expect(startTunnel).toHaveBeenCalledWith("ssh");
    expect(runtime.publicUrl).toBe("https://tunnel.test");
  });

  it("falls back to ngrok when no provider is configured", async () => {
    env.tunneling.provider = undefined;

    await createRuntime();

    expect(startTunnel).toHaveBeenCalledWith("ngrok");
  });

  it("closes the tunnel on dispose", async () => {
    const runtime = await createRuntime();

    await runtime.dispose();

    expect(stop).toHaveBeenCalledOnce();
  });
});
