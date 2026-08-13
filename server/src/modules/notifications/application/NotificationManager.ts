import { notificationsSentTotal } from "../../../infrastructure/metrics/prometheus.js";
import { logger } from "../../../shared/logger/logger.js";
import type { User } from "../../users/domain/User.js";
import type {
  Notification,
  NotificationChannel,
  NotificationResult,
} from "../domain/Notification.js";

function resultLabel(result: NotificationResult): string {
  if (result.sent) {
    return "sent";
  }

  if (result.expired) {
    return "expired";
  }

  if (result.skipped) {
    return "skipped";
  }

  return "failed";
}

export class NotificationManager {
  private readonly channels: NotificationChannel[];

  constructor(channels: NotificationChannel[] = []) {
    this.channels = channels;
  }

  async notify(
    user: User,
    notification: Notification,
  ): Promise<PromiseSettledResult<NotificationResult>[]> {
    return Promise.allSettled(
      this.channels.map(async (channel): Promise<NotificationResult> => {
        if (user.notificationPreferences?.[channel.name] === false) {
          notificationsSentTotal.inc({
            channel: channel.name,
            result: "skipped",
          });

          return {
            sent: false,
            skipped: true,
            reason: "opted_out",
          };
        }

        try {
          const result = await channel.send(user, notification);

          notificationsSentTotal.inc({
            channel: channel.name,
            result: resultLabel(result),
          });

          return result;
        } catch (error: unknown) {
          const err = error as Error;

          notificationsSentTotal.inc({
            channel: channel.name,
            result: "error",
          });

          logger.error(
            {
              channel: channel.name,

              userId: user.id,

              notificationType: notification.type,

              message: err.message,
            },
            "Notification channel failed",
          );

          throw error;
        }
      }),
    );
  }
}
