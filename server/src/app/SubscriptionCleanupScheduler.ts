import { logger } from "../shared/logger/logger.js";

type SubscriptionCleanupSchedulerOptions = {
  intervalMs: number;

  garbageCollectSubscriptions: () => Promise<void>;
};

export class SubscriptionCleanupScheduler {
  private readonly intervalMs: number;

  private readonly garbageCollectSubscriptions: () => Promise<void>;

  private timer: NodeJS.Timeout | null = null;

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

    this.timer = setInterval(async () => {
      try {
        await this.garbageCollectSubscriptions();
      } catch (error) {
        logger.error(
          {
            error,
          },
          "Failed to execute subscription garbage collection",
        );
      }
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
