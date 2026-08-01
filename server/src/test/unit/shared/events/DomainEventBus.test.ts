import { describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";

import {
  createDomainEventBus,
  type DomainEvent,
} from "../../../../shared/events/DomainEventBus.js";

function createFakeLogger() {
  return {
    error: vi.fn(),
  } as unknown as Logger;
}

describe("createDomainEventBus", () => {
  it("delivers an emitted event to a handler registered for that type", async () => {
    const bus = createDomainEventBus(createFakeLogger());
    const handler = vi.fn().mockResolvedValue(undefined);

    bus.on("streamerAdded", handler);
    bus.emit({ type: "streamerAdded", streamerId: "streamer-1" });

    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledWith({
        type: "streamerAdded",
        streamerId: "streamer-1",
      });
    });
  });

  it("calls every handler registered for the same event type", async () => {
    const bus = createDomainEventBus(createFakeLogger());
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);

    bus.on("streamerAdded", first);
    bus.on("streamerAdded", second);
    bus.emit({ type: "streamerAdded", streamerId: "streamer-1" });

    await vi.waitFor(() => {
      expect(first).toHaveBeenCalledOnce();
      expect(second).toHaveBeenCalledOnce();
    });
  });

  it("does not call a handler registered for a different event type", async () => {
    const bus = createDomainEventBus(createFakeLogger());
    const streamerAdded = vi.fn().mockResolvedValue(undefined);
    const streamerEmpty = vi.fn().mockResolvedValue(undefined);

    bus.on("streamerAdded", streamerAdded);
    bus.on("streamerEmpty", streamerEmpty);
    bus.emit({ type: "streamerAdded", streamerId: "streamer-1" });

    await vi.waitFor(() => {
      expect(streamerAdded).toHaveBeenCalledOnce();
    });
    expect(streamerEmpty).not.toHaveBeenCalled();
  });

  it("does not run handlers synchronously within emit()", () => {
    const bus = createDomainEventBus(createFakeLogger());
    const handler = vi.fn().mockResolvedValue(undefined);

    bus.on("streamerAdded", handler);
    bus.emit({ type: "streamerAdded", streamerId: "streamer-1" });

    // The handler is scheduled via Promise.resolve().then(...), so it must
    // not have run yet synchronously after emit() returns.
    expect(handler).not.toHaveBeenCalled();
  });

  it("logs and swallows a handler that returns a rejected promise", async () => {
    const logger = createFakeLogger();
    const bus = createDomainEventBus(logger);
    const error = new Error("handler failed");

    bus.on("streamerAdded", vi.fn().mockRejectedValue(error));

    const event: DomainEvent = { type: "streamerAdded", streamerId: "streamer-1" };
    bus.emit(event);

    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        { error, event },
        'Domain event handler for "streamerAdded" failed',
      );
    });
  });

  it("logs and swallows a handler that throws synchronously", async () => {
    const logger = createFakeLogger();
    const bus = createDomainEventBus(logger);
    const error = new Error("boom");

    bus.on("streamerAdded", () => {
      throw error;
    });

    const event: DomainEvent = { type: "streamerAdded", streamerId: "streamer-1" };
    bus.emit(event);

    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        { error, event },
        'Domain event handler for "streamerAdded" failed',
      );
    });
  });

  it("does not throw when a handler resolves without returning a promise", () => {
    const bus = createDomainEventBus(createFakeLogger());

    // Not every handler in practice returns a Promise (common in tests) -
    // the bus wraps every call in Promise.resolve().then(...) specifically
    // to tolerate this.
    bus.on("streamerAdded", (() => undefined) as unknown as (
      event: Extract<DomainEvent, { type: "streamerAdded" }>,
    ) => Promise<void>);

    expect(() =>
      bus.emit({ type: "streamerAdded", streamerId: "streamer-1" }),
    ).not.toThrow();
  });

  it("does not call a handler for an event emitted before it was registered", async () => {
    const bus = createDomainEventBus(createFakeLogger());
    const lateHandler = vi.fn().mockResolvedValue(undefined);

    bus.emit({ type: "streamerAdded", streamerId: "streamer-1" });
    bus.on("streamerAdded", lateHandler);

    // Flushes the microtask queue (emit() schedules via
    // Promise.resolve().then(...)) instead of a fixed-duration real sleep,
    // so this negative assertion can't flake under a slow/loaded runner.
    await Promise.resolve();
    await Promise.resolve();

    expect(lateHandler).not.toHaveBeenCalled();
  });

  it("stops calling a handler once it has been off()'d", async () => {
    const bus = createDomainEventBus(createFakeLogger());
    const handler = vi.fn().mockResolvedValue(undefined);

    bus.on("streamerAdded", handler);
    bus.off("streamerAdded", handler);
    bus.emit({ type: "streamerAdded", streamerId: "streamer-1" });

    // Flushes the microtask queue (emit() schedules via
    // Promise.resolve().then(...)) instead of a fixed-duration real sleep,
    // so this negative assertion can't flake under a slow/loaded runner.
    await Promise.resolve();
    await Promise.resolve();

    expect(handler).not.toHaveBeenCalled();
  });

  it("off() only removes the matching handler, leaving others registered for the same type", async () => {
    const bus = createDomainEventBus(createFakeLogger());
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);

    bus.on("streamerAdded", first);
    bus.on("streamerAdded", second);
    bus.off("streamerAdded", first);
    bus.emit({ type: "streamerAdded", streamerId: "streamer-1" });

    await vi.waitFor(() => {
      expect(second).toHaveBeenCalledOnce();
    });
    expect(first).not.toHaveBeenCalled();
  });

  it("off() is a no-op for a handler that was never registered", () => {
    const bus = createDomainEventBus(createFakeLogger());
    const handler = vi.fn().mockResolvedValue(undefined);

    expect(() => bus.off("streamerAdded", handler)).not.toThrow();
  });
});
