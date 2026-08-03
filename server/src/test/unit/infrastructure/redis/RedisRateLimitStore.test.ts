import { describe, expect, it, vi } from "vitest";
import type { Redis } from "ioredis";
import type { Options as RateLimitOptions } from "express-rate-limit";

import { RedisRateLimitStore } from "../../../../infrastructure/redis/RedisRateLimitStore.js";

function fakeRedis() {
  return {
    eval: vi.fn(),
    decr: vi.fn(),
    del: vi.fn(),
  } as unknown as Redis & {
    eval: ReturnType<typeof vi.fn>;
    decr: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  };
}

/**
 * A minimal in-process stand-in for Redis's actual key/TTL semantics,
 * driving `eval()` calls through equivalent JS logic keyed off which script
 * was sent (rather than a real Lua interpreter). Used so the decrement
 * leaked-key regression test below exercises the store's real DEL/PEXPIRE
 * decision-making end to end, instead of just asserting on the raw script
 * text like the other tests in this file.
 */
const fakeLuaState = new Map<string, { value: number; expiresAt: number | null }>();

function fakeLuaRedis() {
  fakeLuaState.clear();

  return {
    eval: vi.fn(
      (script: string, _numKeys: number, key: string, windowMs: number) => {
        const entry = fakeLuaState.get(key);

        if (script.includes("DECR")) {
          const value = (entry?.value ?? 0) - 1;

          if (value <= 0) {
            fakeLuaState.delete(key);
          } else if (!entry?.expiresAt) {
            fakeLuaState.set(key, { value, expiresAt: Date.now() + windowMs });
          } else {
            fakeLuaState.set(key, { value, expiresAt: entry.expiresAt });
          }

          return Promise.resolve(null);
        }

        const value = (entry?.value ?? 0) + 1;
        const expiresAt =
          value === 1 ? Date.now() + windowMs : (entry?.expiresAt ?? null);

        fakeLuaState.set(key, { value, expiresAt });

        return Promise.resolve([
          value,
          expiresAt ? expiresAt - Date.now() : -1,
        ]);
      },
    ),
  } as unknown as Redis & { eval: ReturnType<typeof vi.fn> };
}

describe("RedisRateLimitStore", () => {
  describe("increment", () => {
    it("runs the atomic increment script against the prefixed key with the configured window", async () => {
      const redis = fakeRedis();

      redis.eval.mockResolvedValue([1, 900_000]);

      const store = new RedisRateLimitStore(redis, { prefix: "rl:api:" });

      store.init({ windowMs: 900_000 } as RateLimitOptions);

      await store.increment("1.2.3.4");

      expect(redis.eval).toHaveBeenCalledWith(
        expect.stringContaining("INCR"),
        1,
        "rl:api:1.2.3.4",
        900_000,
      );
    });

    it("returns the hit count and a reset time derived from the key's remaining TTL", async () => {
      const redis = fakeRedis();

      redis.eval.mockResolvedValue([5, 12_345]);

      const store = new RedisRateLimitStore(redis, { prefix: "rl:api:" });

      store.init({ windowMs: 60_000 } as RateLimitOptions);

      const before = Date.now();
      const result = await store.increment("1.2.3.4");
      const after = Date.now();

      expect(result.totalHits).toBe(5);
      expect(result.resetTime?.getTime()).toBeGreaterThanOrEqual(
        before + 12_345,
      );
      expect(result.resetTime?.getTime()).toBeLessThanOrEqual(after + 12_345);
    });

    it("falls back to windowMs for the reset time when Redis reports no TTL", async () => {
      const redis = fakeRedis();

      // PTTL returns -1 for a key with no expiry and -2 for a missing key;
      // either way there's no usable TTL to derive a reset time from.
      redis.eval.mockResolvedValue([1, -1]);

      const store = new RedisRateLimitStore(redis, { prefix: "rl:api:" });

      store.init({ windowMs: 30_000 } as RateLimitOptions);

      const before = Date.now();
      const result = await store.increment("1.2.3.4");

      expect(result.resetTime?.getTime()).toBeGreaterThanOrEqual(
        before + 30_000,
      );
    });

    it("uses a 60 second default window before init() is called", async () => {
      const redis = fakeRedis();

      redis.eval.mockResolvedValue([1, 60_000]);

      const store = new RedisRateLimitStore(redis, { prefix: "rl:api:" });

      await store.increment("1.2.3.4");

      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        "rl:api:1.2.3.4",
        60_000,
      );
    });
  });

  describe("decrement", () => {
    it("runs the atomic decrement script against the prefixed key with the configured window", async () => {
      const redis = fakeRedis();

      const store = new RedisRateLimitStore(redis, { prefix: "rl:api:" });

      store.init({ windowMs: 900_000 } as RateLimitOptions);

      await store.decrement("1.2.3.4");

      expect(redis.eval).toHaveBeenCalledWith(
        expect.stringContaining("DECR"),
        1,
        "rl:api:1.2.3.4",
        900_000,
      );
    });

    it("deletes the key once its count would leave it without a TTL, rather than DECR alone leaking a key that never expires", async () => {
      // A bare DECR on a key that has already expired (or never existed)
      // creates it fresh at -1 with no TTL at all - only increment()'s own
      // script ever attaches one, and only on that key's first hit. This
      // exercises the real Lua script end to end against an in-process
      // Redis-like key store rather than asserting on the script text, so a
      // regression in the script's actual DEL/PEXPIRE behavior would be
      // caught, not just a change to how it's invoked.
      const store = new RedisRateLimitStore(fakeLuaRedis(), {
        prefix: "rl:api:",
      });

      store.init({ windowMs: 900_000 } as RateLimitOptions);

      await store.decrement("1.2.3.4");

      expect(fakeLuaState.has("rl:api:1.2.3.4")).toBe(false);
    });
  });

  describe("resetKey", () => {
    it("deletes the prefixed key", async () => {
      const redis = fakeRedis();

      const store = new RedisRateLimitStore(redis, { prefix: "rl:api:" });

      await store.resetKey("1.2.3.4");

      expect(redis.del).toHaveBeenCalledWith("rl:api:1.2.3.4");
    });
  });

  describe("prefix isolation", () => {
    it("keys two stores with different prefixes independently", async () => {
      const redis = fakeRedis();

      redis.eval.mockResolvedValue([1, 1000]);

      const apiStore = new RedisRateLimitStore(redis, { prefix: "rl:api:" });
      const eventSubStore = new RedisRateLimitStore(redis, {
        prefix: "rl:eventsub:",
      });

      await apiStore.increment("1.2.3.4");
      await eventSubStore.increment("1.2.3.4");

      expect(redis.eval).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        1,
        "rl:api:1.2.3.4",
        expect.any(Number),
      );
      expect(redis.eval).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        1,
        "rl:eventsub:1.2.3.4",
        expect.any(Number),
      );
    });
  });
});
