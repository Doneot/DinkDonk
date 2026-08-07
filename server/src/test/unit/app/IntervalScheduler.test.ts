import { afterEach, describe, expect, it, vi } from "vitest";

import { IntervalScheduler } from "../../../app/IntervalScheduler.js";
import { logger } from "../../../shared/logger/logger.js";

function setup(run = vi.fn().mockResolvedValue(undefined)) {
  return {
    run,
    scheduler: new IntervalScheduler({
      intervalMs: 1_000,
      taskName: "subscription garbage collection",
      run,
    }),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("IntervalScheduler", () => {
  it("does not run before it is started", async () => {
    vi.useFakeTimers();

    const { run } = setup();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(run).not.toHaveBeenCalled();
  });

  it("runs the task immediately on start, before any interval elapses", async () => {
    vi.useFakeTimers();

    const { scheduler, run } = setup();

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(run).toHaveBeenCalledOnce();

    scheduler.stop();
  });

  it("runs the task on every interval tick, in addition to the immediate run", async () => {
    vi.useFakeTimers();

    const { scheduler, run } = setup();

    scheduler.start();

    await vi.advanceTimersByTimeAsync(3_000);

    // 1 immediate run on start() + 3 interval ticks.
    expect(run).toHaveBeenCalledTimes(4);

    scheduler.stop();
  });

  it("ignores a second start while already running", async () => {
    vi.useFakeTimers();

    const { scheduler, run } = setup();

    scheduler.start();
    scheduler.start();

    await vi.advanceTimersByTimeAsync(1_000);

    // 1 immediate run from the first start() (the second is a no-op) + 1
    // interval tick.
    expect(run).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it("stops running after stop", async () => {
    vi.useFakeTimers();

    const { scheduler, run } = setup();

    scheduler.start();

    await vi.advanceTimersByTimeAsync(1_000);

    scheduler.stop();

    await vi.advanceTimersByTimeAsync(5_000);

    // 1 immediate run + 1 interval tick before stop() took effect.
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("tolerates stop being called twice", () => {
    const { scheduler } = setup();

    scheduler.start();
    scheduler.stop();

    expect(() => scheduler.stop()).not.toThrow();
  });

  it("can be restarted after being stopped", async () => {
    vi.useFakeTimers();

    const { scheduler, run } = setup();

    scheduler.start();
    scheduler.stop();
    scheduler.start();

    await vi.advanceTimersByTimeAsync(1_000);

    // The first start()'s immediate run is still "running" (no microtask
    // tick has elapsed between these synchronous calls), so the restart's
    // own immediate run is skipped by the overlap guard: 1 immediate run +
    // 1 interval tick.
    expect(run).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it("logs a failing run and keeps the schedule alive", async () => {
    vi.useFakeTimers();

    const error = vi.spyOn(logger, "error").mockReturnValue();
    const { scheduler, run } = setup(
      vi.fn().mockRejectedValue(new Error("twitch unavailable")),
    );

    scheduler.start();

    await vi.advanceTimersByTimeAsync(2_000);

    // 1 immediate run + 2 interval ticks, each failing and logging.
    expect(run).toHaveBeenCalledTimes(3);
    expect(error).toHaveBeenCalledTimes(3);
    expect(error.mock.calls[0]?.[1]).toBe(
      "Failed to execute subscription garbage collection",
    );

    scheduler.stop();
  });
});
