import { afterEach, describe, expect, it, vi } from "vitest";

import { SubscriptionCleanupScheduler } from "../../../app/SubscriptionCleanupScheduler.js";
import { logger } from "../../../shared/logger/logger.js";

function setup(
  garbageCollectSubscriptions = vi.fn().mockResolvedValue(undefined),
) {
  return {
    garbageCollectSubscriptions,
    scheduler: new SubscriptionCleanupScheduler({
      intervalMs: 1_000,
      garbageCollectSubscriptions,
    }),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SubscriptionCleanupScheduler", () => {
  it("does not run before it is started", async () => {
    vi.useFakeTimers();

    const { garbageCollectSubscriptions } = setup();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(garbageCollectSubscriptions).not.toHaveBeenCalled();
  });

  it("runs the sweep on every interval tick", async () => {
    vi.useFakeTimers();

    const { scheduler, garbageCollectSubscriptions } = setup();

    scheduler.start();

    await vi.advanceTimersByTimeAsync(3_000);

    expect(garbageCollectSubscriptions).toHaveBeenCalledTimes(3);

    scheduler.stop();
  });

  it("ignores a second start while already running", async () => {
    vi.useFakeTimers();

    const { scheduler, garbageCollectSubscriptions } = setup();

    scheduler.start();
    scheduler.start();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(garbageCollectSubscriptions).toHaveBeenCalledOnce();

    scheduler.stop();
  });

  it("stops running after stop", async () => {
    vi.useFakeTimers();

    const { scheduler, garbageCollectSubscriptions } = setup();

    scheduler.start();

    await vi.advanceTimersByTimeAsync(1_000);

    scheduler.stop();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(garbageCollectSubscriptions).toHaveBeenCalledOnce();
  });

  it("tolerates stop being called twice", () => {
    const { scheduler } = setup();

    scheduler.start();
    scheduler.stop();

    expect(() => scheduler.stop()).not.toThrow();
  });

  it("can be restarted after being stopped", async () => {
    vi.useFakeTimers();

    const { scheduler, garbageCollectSubscriptions } = setup();

    scheduler.start();
    scheduler.stop();
    scheduler.start();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(garbageCollectSubscriptions).toHaveBeenCalledOnce();

    scheduler.stop();
  });

  it("logs a failing sweep and keeps the schedule alive", async () => {
    vi.useFakeTimers();

    const error = vi.spyOn(logger, "error").mockReturnValue();
    const { scheduler, garbageCollectSubscriptions } = setup(
      vi.fn().mockRejectedValue(new Error("twitch unavailable")),
    );

    scheduler.start();

    await vi.advanceTimersByTimeAsync(2_000);

    expect(garbageCollectSubscriptions).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(2);
    expect(error.mock.calls[0]?.[1]).toBe(
      "Failed to execute subscription garbage collection",
    );

    scheduler.stop();
  });
});
