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
    it("decrements the prefixed key", async () => {
      const redis = fakeRedis();

      const store = new RedisRateLimitStore(redis, { prefix: "rl:api:" });

      await store.decrement("1.2.3.4");

      expect(redis.decr).toHaveBeenCalledWith("rl:api:1.2.3.4");
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
