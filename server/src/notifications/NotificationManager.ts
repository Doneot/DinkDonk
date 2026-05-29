import { logger } from "../utils/logger.js";
import type { User } from "../types/user.js";
import type {
  Notification,
  NotificationChannel,
  NotificationResult,
} from "../types/notifications.js";

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
        try {
          return await channel.send(user, notification);
        } catch (error: unknown) {
          const err = error as Error;

          logger.error("Notification channel failed", {
            channel: channel.name,

            userId: user.id,

            notificationType: notification.type,

            message: err.message,
          });

          throw error;
        }
      }),
    );
  }
}
