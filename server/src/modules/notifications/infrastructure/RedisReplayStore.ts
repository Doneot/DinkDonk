import type { Redis } from "ioredis";

import { logger } from "../../../shared/logger/logger.js";
import type { ReplayStore } from "../ports/ReplayStore.js";

const DEFAULT_PREFIX = "eventsub:replay:";

/**
 * Shares EventSub message-id dedup across every backend instance and across
 * restarts, unlike InMemoryReplayStore's process-local Map. Redis's own key
 * expiry replaces the manual cleanup-interval sweep the in-memory version
 * needed.
 */
export class RedisReplayStore implements ReplayStore {
  private readonly prefix: string;

  constructor(
    private readonly redis: Redis,
    private readonly ttlMs: number,
    { prefix = DEFAULT_PREFIX }: { prefix?: string } = {},
  ) {
    this.prefix = prefix;
  }

  async rememberIfNew(messageId: string): Promise<boolean> {
    try {
      // SET key value NX PX ttl: atomically claims the key only if it
      // doesn't already exist, which is exactly "first time seeing this
      // message id" - the same guarantee a Firestore create()-fails-if-
      // exists write would give, just far cheaper for a check done on every
      // single EventSub delivery.
      const result = await this.redis.set(
        this.prefix + messageId,
        "1",
        "PX",
        this.ttlMs,
        "NX",
      );

      return result === "OK";
    } catch (error) {
      // Fail open: a Redis blip must not block the Twitch webhook pipeline
      // (Twitch expects a timely 2xx or it retries, compounding the
      // problem). Worst case is an occasional duplicate notification, which
      // is exactly the pre-existing single-instance/restart risk this store
      // replaces - not a new failure mode, just a wider window for it.
      logger.error(
        { error, messageId },
        "Redis replay store error; allowing message through unchecked",
      );

      return true;
    }
  }

  async forget(messageId: string): Promise<void> {
    try {
      await this.redis.del(this.prefix + messageId);
    } catch (error) {
      logger.error(
        { error, messageId },
        "Redis replay store error while releasing a reservation",
      );
    }
  }
}
