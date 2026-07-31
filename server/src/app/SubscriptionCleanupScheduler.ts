import { logger } from "../shared/logger/logger.js";

type SubscriptionCleanupSchedulerOptions = {
  intervalMs: number;

  garbageCollectSubscriptions: () => Promise<void>;
};

export class SubscriptionCleanupScheduler {
  private readonly intervalMs: number;

  private readonly garbageCollectSubscriptions: () => Promise<void>;

  private timer: NodeJS.Timeout | null = null;

  private running = false;

  constructor({
    intervalMs,
    garbageCollectSubscriptions,
  }: SubscriptionCleanupSchedulerOptions) {
    this.intervalMs = intervalMs;

    this.garbageCollectSubscriptions = garbageCollectSubscriptions;
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      // setInterval doesn't wait for a previous async invocation to settle
      // before firing again; guard against overlapping runs if a pass ever
      // takes longer than intervalMs.
      if (this.running) {
        logger.warn(
          "Subscription garbage collection still running from the previous tick; skipping this one",
        );

        return;
      }

      this.running = true;

      this.garbageCollectSubscriptions()
        .catch((error: unknown) => {
          logger.error(
            {
              error,
            },
            "Failed to execute subscription garbage collection",
          );
        })
        .finally(() => {
          this.running = false;
        });
    }, this.intervalMs);
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);

    this.timer = null;
  }
}
