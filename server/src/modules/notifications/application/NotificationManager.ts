import { logger } from "../../../shared/logger/logger.js";
import type { User } from "../../users/domain/User.js";
import type {
  Notification,
  NotificationChannel,
  NotificationResult,
} from "../domain/Notification.js";

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
