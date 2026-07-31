import { describe, expect, it, vi } from "vitest";
import type { Redis } from "ioredis";

import { RedisReplayStore } from "../../../../modules/notifications/infrastructure/RedisReplayStore.js";
import { logger } from "../../../../shared/logger/logger.js";

function fakeRedis() {
  return {
    set: vi.fn(),
    del: vi.fn(),
  } as unknown as Redis & { set: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> };
}

describe("RedisReplayStore", () => {
  describe("rememberIfNew", () => {
    it("claims a message id the first time it is seen", async () => {
      const redis = fakeRedis();

      redis.set.mockResolvedValue("OK");

      const store = new RedisReplayStore(redis, 60_000);

      await expect(store.rememberIfNew("message-1")).resolves.toBe(true);

      expect(redis.set).toHaveBeenCalledWith(
        "eventsub:replay:message-1",
        "1",
        "PX",
        60_000,
        "NX",
      );
    });

    it("rejects a message id that is already claimed", async () => {
      const redis = fakeRedis();

      // SET ... NX returns null when the key already exists.
      redis.set.mockResolvedValue(null);

      const store = new RedisReplayStore(redis, 60_000);

      await expect(store.rememberIfNew("message-1")).resolves.toBe(false);
    });

    it("uses the configured key prefix", async () => {
      const redis = fakeRedis();

      redis.set.mockResolvedValue("OK");

      const store = new RedisReplayStore(redis, 60_000, { prefix: "custom:" });

      await store.rememberIfNew("message-1");

      expect(redis.set).toHaveBeenCalledWith(
        "custom:message-1",
        "1",
        "PX",
        60_000,
        "NX",
      );
    });

    it("fails open and logs when Redis errors", async () => {
      const error = vi.spyOn(logger, "error").mockReturnValue();
      const redis = fakeRedis();

      redis.set.mockRejectedValue(new Error("connection lost"));

      const store = new RedisReplayStore(redis, 60_000);

      await expect(store.rememberIfNew("message-1")).resolves.toBe(true);

      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: "message-1" }),
        "Redis replay store error; allowing message through unchecked",
      );
    });
  });

  describe("forget", () => {
    it("releases a previously-claimed message id", async () => {
      const redis = fakeRedis();

      redis.del.mockResolvedValue(1);

      const store = new RedisReplayStore(redis, 60_000);

      await store.forget("message-1");

      expect(redis.del).toHaveBeenCalledWith("eventsub:replay:message-1");
    });

    it("swallows a Redis error rather than throwing", async () => {
      vi.spyOn(logger, "error").mockReturnValue();
      const redis = fakeRedis();

      redis.del.mockRejectedValue(new Error("connection lost"));

      const store = new RedisReplayStore(redis, 60_000);

      await expect(store.forget("message-1")).resolves.toBeUndefined();
    });
  });
});
