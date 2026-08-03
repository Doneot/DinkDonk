import { logger } from "../shared/logger/logger.js";

type IntervalSchedulerOptions = {
  intervalMs: number;

  /** A short, log-friendly description of what run() does, e.g. "subscription garbage collection". */
  taskName: string;

  run: () => Promise<void>;
};

export class IntervalScheduler {
  private readonly intervalMs: number;

  private readonly taskName: string;

  private readonly run: () => Promise<void>;

  private timer: NodeJS.Timeout | null = null;

  private running = false;

  constructor({ intervalMs, taskName, run }: IntervalSchedulerOptions) {
    this.intervalMs = intervalMs;

    this.taskName = taskName;

    this.run = run;
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
          `${this.taskName} still running from the previous tick; skipping this one`,
        );

        return;
      }

      this.running = true;

      this.run()
        .catch((error: unknown) => {
          logger.error(
            {
              error,
            },
            `Failed to execute ${this.taskName}`,
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
