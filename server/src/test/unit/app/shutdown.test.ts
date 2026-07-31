import type http from "node:http";
import type { MockInstance } from "vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Container } from "../../../app/container/index.js";
import type { Server } from "../../../app/server.js";
import type { Runtime } from "../../../app/runtime/Runtime.js";
import type { SubscriptionCleanupScheduler } from "../../../app/SubscriptionCleanupScheduler.js";
import { registerShutdownHooks } from "../../../app/shutdown.js";
import type { UserChangeBroadcaster } from "../../../modules/users/application/UserChangeBroadcaster.js";
import type { SocketServer } from "../../../realtime/socketServer.js";
import { env } from "../../../shared/config/env.js";
import { logger } from "../../../shared/logger/logger.js";

type ExitSpy = MockInstance<typeof process.exit>;

const SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGBREAK"];

function setup() {
  const calls: string[] = [];

  const record =
    (name: string, result: () => Promise<unknown> = () => Promise.resolve()) =>
    () => {
      calls.push(name);

      return result();
    };

  const runtime = { publicUrl: "", dispose: vi.fn(record("runtime")) };

  const httpServer = {
    close: (callback: (error?: Error) => void) => {
      calls.push("http");
      callback();
    },
    closeAllConnections: vi.fn(),
  } as unknown as http.Server;

  const sockets = {
    close: vi.fn(record("sockets")),
  } as unknown as SocketServer;
  const discordStop = vi.fn(record("discord"));
  const twitchStop = vi.fn(record("twitch"));
  const firestoreTerminate = vi.fn(record("firestore"));
  const redisQuit = vi.fn(record("redis"));

  const container = {
    twitch: { stop: twitchStop },
    discord: { stop: discordStop },
    firestore: { terminate: firestoreTerminate },
    redis: { quit: redisQuit },
  } as unknown as Container;

  const broadcaster = { stop: vi.fn(record("broadcaster")) };
  const scheduler = { stop: vi.fn(record("scheduler")) };

  registerShutdownHooks(
    runtime as unknown as Runtime,
    container,
    { httpServer, sockets } as unknown as Server,
    broadcaster as unknown as UserChangeBroadcaster,
    scheduler as unknown as SubscriptionCleanupScheduler,
  );

  return {
    calls,
    runtime,
    sockets,
    broadcaster,
    scheduler,
    twitchStop,
    discordStop,
    firestoreTerminate,
    redisQuit,
  };
}

/**
 * Waits for the async shutdown chain triggered by a signal to settle.
 * `process.exit` is stubbed, so the handler runs to completion.
 */
async function emitSignal(
  exit: ExitSpy,
  signal: NodeJS.Signals = "SIGTERM",
): Promise<void> {
  process.emit(signal, signal);

  await vi.waitFor(() => {
    expect(exit).toHaveBeenCalled();
  });
}

function stubExit(): ExitSpy {
  return vi
    .spyOn(process, "exit")
    .mockImplementation((() => undefined) as never);
}

afterEach(() => {
  for (const signal of SIGNALS) {
    process.removeAllListeners(signal);
  }

  vi.restoreAllMocks();
  env.unsubscribeEventSubOnShutdown = false;
});

describe("registerShutdownHooks", () => {
  it("registers handlers for the interrupt and terminate signals", () => {
    setup();

    expect(process.listenerCount("SIGINT")).toBe(1);
    expect(process.listenerCount("SIGTERM")).toBe(1);
    expect(process.listenerCount("SIGBREAK")).toBe(0);
  });

  it("also handles SIGBREAK on Windows", () => {
    const platform = process.platform;

    Object.defineProperty(process, "platform", { value: "win32" });

    try {
      setup();

      expect(process.listenerCount("SIGBREAK")).toBe(1);
    } finally {
      Object.defineProperty(process, "platform", { value: platform });
    }
  });

  it("tears every subsystem down in order and exits cleanly", async () => {
    vi.spyOn(logger, "info").mockReturnValue();
    vi.spyOn(logger, "flush").mockImplementation((callback?: () => void) =>
      callback?.(),
    );

    const exit = stubExit();

    const { calls } = setup();

    await emitSignal(exit);

    expect(calls).toEqual([
      "broadcaster",
      "scheduler",
      "runtime",
      "sockets",
      "discord",
      "twitch",
      "firestore",
      "redis",
    ]);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("passes the configured EventSub unsubscribe flag to the Twitch provider", async () => {
    vi.spyOn(logger, "info").mockReturnValue();
    vi.spyOn(logger, "flush").mockImplementation((callback?: () => void) =>
      callback?.(),
    );
    const exit = stubExit();

    env.unsubscribeEventSubOnShutdown = true;

    const { twitchStop } = setup();

    await emitSignal(exit);

    expect(twitchStop.mock.calls).toEqual([[{ unsubscribeEventSub: true }]]);
  });

  it("ignores repeated signals once a shutdown is under way", async () => {
    vi.spyOn(logger, "info").mockReturnValue();
    vi.spyOn(logger, "flush").mockImplementation((callback?: () => void) =>
      callback?.(),
    );
    const exit = stubExit();

    const { broadcaster } = setup();

    process.emit("SIGTERM", "SIGTERM");
    process.emit("SIGINT", "SIGINT");

    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalled();
    });

    expect(broadcaster.stop).toHaveBeenCalledOnce();
  });

  it("forces remaining HTTP connections closed if closing the server times out", async () => {
    vi.useFakeTimers();

    try {
      vi.spyOn(logger, "info").mockReturnValue();
      vi.spyOn(logger, "warn").mockReturnValue();
      vi.spyOn(logger, "flush").mockImplementation((callback?: () => void) =>
        callback?.(),
      );

      const exit = stubExit();
      const closeAllConnections = vi.fn();

      const httpServer = {
        closeAllConnections,
      } as unknown as http.Server;

      const sockets = {
        // Never resolves, simulating a client connection that never ends on
        // its own (io.close()'s callback only fires once every client is
        // gone).
        close: vi.fn(() => new Promise(() => {})),
      } as unknown as SocketServer;

      const container = {
        twitch: { stop: vi.fn().mockResolvedValue(undefined) },
        discord: { stop: vi.fn().mockResolvedValue(undefined) },
        firestore: { terminate: vi.fn().mockResolvedValue(undefined) },
        redis: { quit: vi.fn().mockResolvedValue(undefined) },
      } as unknown as Container;

      const runtime = {
        publicUrl: "",
        dispose: vi.fn().mockResolvedValue(undefined),
      };

      registerShutdownHooks(
        runtime,
        container,
        { httpServer, sockets } as unknown as Server,
        { stop: vi.fn() } as unknown as UserChangeBroadcaster,
        { stop: vi.fn() } as unknown as SubscriptionCleanupScheduler,
      );

      process.emit("SIGTERM", "SIGTERM");

      await vi.advanceTimersByTimeAsync(5000);

      expect(closeAllConnections).toHaveBeenCalledOnce();
      expect(exit).toHaveBeenCalledWith(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("continues tearing down remaining steps and exits with a failure code when one step rejects", async () => {
    vi.spyOn(logger, "info").mockReturnValue();

    const warn = vi.spyOn(logger, "warn").mockReturnValue();
    const exit = stubExit();

    const { runtime, discordStop, twitchStop } = setup();

    runtime.dispose.mockRejectedValue(new Error("dispose failed"));

    await emitSignal(exit);

    expect(warn).toHaveBeenCalledWith(
      {
        step: "runtime.dispose",
        error: expect.any(Error) as Error,
      },
      "Shutdown step failed; continuing teardown",
    );

    // A failing step doesn't abort the rest of teardown.
    expect(discordStop).toHaveBeenCalledOnce();
    expect(twitchStop).toHaveBeenCalledOnce();

    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits with a failure code if the shutdown handler itself throws unexpectedly", async () => {
    vi.spyOn(logger, "info").mockReturnValue();
    vi.spyOn(logger, "warn").mockReturnValue();

    const error = vi.spyOn(logger, "error").mockReturnValue();
    const exit = stubExit();

    vi.spyOn(logger, "flush").mockImplementation(() => {
      throw new Error("logging backend unavailable");
    });

    setup();

    await emitSignal(exit);

    expect(error.mock.calls[0]?.[0]).toMatchObject({
      message: "logging backend unavailable",
    });
    expect(exit).toHaveBeenCalledWith(1);
  });
});
