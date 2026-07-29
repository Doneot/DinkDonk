import { afterEach, describe, expect, it, vi } from "vitest";

import { InMemoryReplayStore } from "../../../../modules/notifications/infrastructure/InMemoryReplayStore.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("InMemoryReplayStore", () => {
  it("accepts a message id the first time it is seen", async () => {
    const store = new InMemoryReplayStore({ ttlMs: 60_000 });

    await expect(store.rememberIfNew("message-1")).resolves.toBe(true);

    store.dispose();
  });

  it("rejects a message id that is still within its ttl", async () => {
    const store = new InMemoryReplayStore({ ttlMs: 60_000 });

    await store.rememberIfNew("message-1");

    await expect(store.rememberIfNew("message-1")).resolves.toBe(false);

    store.dispose();
  });

  it("tracks distinct message ids independently", async () => {
    const store = new InMemoryReplayStore({ ttlMs: 60_000 });

    await store.rememberIfNew("message-1");

    await expect(store.rememberIfNew("message-2")).resolves.toBe(true);

    store.dispose();
  });

  it("accepts a message id again once its ttl has elapsed", async () => {
    vi.useFakeTimers();

    const store = new InMemoryReplayStore({ ttlMs: 1_000 });

    await store.rememberIfNew("message-1");

    vi.setSystemTime(Date.now() + 1_001);

    await expect(store.rememberIfNew("message-1")).resolves.toBe(true);

    store.dispose();
  });

  it("keeps unexpired entries when the cleanup sweep runs", async () => {
    vi.useFakeTimers();

    const store = new InMemoryReplayStore({
      ttlMs: 4_000,
      cleanupEveryMs: 5_000,
    });

    await store.rememberIfNew("expired");

    await vi.advanceTimersByTimeAsync(3_000);

    await store.rememberIfNew("fresh");

    await vi.advanceTimersByTimeAsync(2_000);

    await expect(store.rememberIfNew("expired")).resolves.toBe(true);
    await expect(store.rememberIfNew("fresh")).resolves.toBe(false);

    store.dispose();
  });

  it("allows a forgotten message id to be reserved again immediately", async () => {
    const store = new InMemoryReplayStore({ ttlMs: 60_000 });

    await store.rememberIfNew("message-1");

    await store.forget("message-1");

    await expect(store.rememberIfNew("message-1")).resolves.toBe(true);

    store.dispose();
  });

  it("is a no-op when forgetting a message id that was never reserved", async () => {
    const store = new InMemoryReplayStore({ ttlMs: 60_000 });

    await expect(store.forget("never-seen")).resolves.toBeUndefined();

    store.dispose();
  });

  it("stops its cleanup timer on disposal", () => {
    vi.useFakeTimers();

    const store = new InMemoryReplayStore({
      ttlMs: 1_000,
      cleanupEveryMs: 5_000,
    });

    expect(vi.getTimerCount()).toBe(1);

    store.dispose();

    expect(vi.getTimerCount()).toBe(0);
  });
});
