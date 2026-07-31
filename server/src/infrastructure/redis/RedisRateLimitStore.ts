import type { Redis } from "ioredis";
import type {
  Store,
  IncrementResponse,
  Options as RateLimitOptions,
} from "express-rate-limit";

// Atomic fixed-window counter: increments the key, and sets its expiry only
// on the very first hit of the window. Setting the expiry unconditionally on
// every hit would let a steady stream of requests keep pushing the window
// out indefinitely, never actually resetting - this is the same fixed-window
// semantics express-rate-limit's own MemoryStore implements, just shared
// across processes via Redis instead of an in-process Map.
const INCREMENT_SCRIPT = `
local totalHits = redis.call("INCR", KEYS[1])
if totalHits == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return {totalHits, ttl}
`;

/**
 * A Redis-backed express-rate-limit Store, sharing hit counters across
 * every backend instance and surviving a restart of any one of them -
 * unlike the library's default in-process MemoryStore.
 *
 * Callers should pass `passOnStoreError: true` alongside this store so a
 * transient Redis outage fails the request open (unrestricted) rather than
 * 500ing every request while Redis is unreachable.
 */
export class RedisRateLimitStore implements Store {
  windowMs = 60_000;

  readonly prefix: string;

  constructor(
    readonly redis: Redis,
    { prefix }: { prefix: string },
  ) {
    this.prefix = prefix;
  }

  init(options: RateLimitOptions): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const [totalHits, ttl] = (await this.redis.eval(
      INCREMENT_SCRIPT,
      1,
      this.prefix + key,
      this.windowMs,
    )) as [number, number];

    return {
      totalHits,
      resetTime: new Date(Date.now() + (ttl > 0 ? ttl : this.windowMs)),
    };
  }

  async decrement(key: string): Promise<void> {
    await this.redis.decr(this.prefix + key);
  }

  async resetKey(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }
}
