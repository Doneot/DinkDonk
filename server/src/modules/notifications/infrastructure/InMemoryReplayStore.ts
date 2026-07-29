import type { ReplayStore } from "../ports/ReplayStore.js";

/**
 * Single-instance only: the dedupe set lives in process memory, so it is
 * wiped on restart and isn't shared across instances. A Twitch EventSub
 * redelivery that lands shortly after a restart, or that a load balancer
 * routes to a different instance than the original delivery, will not be
 * caught and can produce a duplicate notification. Fine for a single-instance
 * deployment; back this with Firestore/Redis before running more than one
 * instance or relying on dedupe across frequent restarts.
 */
export class InMemoryReplayStore implements ReplayStore {
  private readonly entries = new Map<string, number>();

  private readonly cleanupInterval: NodeJS.Timeout;

  private readonly ttlMs: number;

  constructor({
    ttlMs,
    cleanupEveryMs = 60_000,
  }: {
    ttlMs: number;
    cleanupEveryMs?: number;
  }) {
    this.ttlMs = ttlMs;

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupEveryMs);

    // Don't keep Node alive solely because of this timer.
    this.cleanupInterval.unref();
  }

  rememberIfNew(messageId: string): Promise<boolean> {
    const now = Date.now();

    const expiresAt = this.entries.get(messageId);

    if (expiresAt !== undefined) {
      if (expiresAt > now) {
        return Promise.resolve(false);
      }
      this.entries.delete(messageId);
    }

    this.entries.set(messageId, now + this.ttlMs);

    return Promise.resolve(true);
  }

  forget(messageId: string): Promise<void> {
    this.entries.delete(messageId);

    return Promise.resolve();
  }

  private cleanup(): void {
    const now = Date.now();

    for (const [messageId, expiresAt] of this.entries) {
      if (expiresAt <= now) {
        this.entries.delete(messageId);
      }
    }
  }

  dispose(): void {
    clearInterval(this.cleanupInterval);
  }
}
