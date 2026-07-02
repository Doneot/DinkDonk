import type { ReplayStore } from "../ports/ReplayStore.js";

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
