import { Redis } from "ioredis";

import { env } from "../../shared/config/env.js";
import { logger } from "../../shared/logger/logger.js";

/**
 * Backs the rate limiters and the EventSub replay store so both work
 * correctly across a restart and across multiple backend instances (a plain
 * in-memory Map, the previous approach, is wiped on restart and isn't
 * shared between instances). ioredis reconnects and queues commands
 * automatically by default; the error listener below is required so a
 * connection blip logs instead of crashing the process via Node's default
 * unhandled-'error'-event behavior.
 */
export function createRedisClient(): Redis {
  const client = new Redis(env.redisUrl, {
    // Fail a command quickly rather than queuing it indefinitely while
    // disconnected, so callers (rate limiter, replay store) can fail open
    // promptly instead of hanging a request.
    maxRetriesPerRequest: 1,

    // Don't open a socket until the first command actually needs one -
    // avoids an unnecessary connection (and connection-error noise) for any
    // process that constructs the container without ever exercising a
    // request path that touches Redis, e.g. some tests and one-off scripts.
    lazyConnect: true,
  });

  client.on("error", (error: unknown) => {
    logger.error({ error }, "Redis client error");
  });

  return client;
}

export type { Redis };
