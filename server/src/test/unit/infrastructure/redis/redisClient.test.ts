import { afterEach, describe, expect, it, vi } from "vitest";

import { createRedisClient } from "../../../../infrastructure/redis/redisClient.js";
import { env } from "../../../../shared/config/env.js";
import { logger } from "../../../../shared/logger/logger.js";

const ORIGINAL_REDIS_URL = env.redisUrl;

afterEach(() => {
  env.redisUrl = ORIGINAL_REDIS_URL;
  vi.restoreAllMocks();
});

describe("createRedisClient", () => {
  it("returns undefined and logs when REDIS_URL isn't configured", () => {
    const info = vi.spyOn(logger, "info").mockReturnValue();

    env.redisUrl = undefined;

    const client = createRedisClient();

    expect(client).toBeUndefined();
    expect(info).toHaveBeenCalledWith(
      "REDIS_URL not set; rate limiting, EventSub replay dedup, and the " +
        "distributed token-refresh lock will run in-process only",
    );
  });

  it("builds a real client, without connecting, when REDIS_URL is configured", () => {
    env.redisUrl = "redis://localhost:6379";

    const client = createRedisClient();

    try {
      expect(client).toBeDefined();
      // lazyConnect: true - no socket should be opened just from
      // constructing the client.
      expect(client?.status).toBe("wait");
    } finally {
      // Constructing a real ioredis client, even without connecting,
      // leaves timers registered - avoid leaking them across test files.
      void client?.disconnect();
    }
  });
});
