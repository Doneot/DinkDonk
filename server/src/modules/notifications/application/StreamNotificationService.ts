import type { TwitchStreamerProvider } from "../../twitch/ports/TwitchGateway.js";
import type { UserRepository } from "../../users/ports/UserRepository.js";
import type { StreamerRepository } from "../../streamers/ports/StreamerRepository.js";
import type { NotificationManager } from "./NotificationManager.js";
import type {
  TwitchEventSubStreamOnlineEvent,
  TwitchStreamer,
} from "../../twitch/domain/Twitch.js";
import { buildStreamerLivePayload } from "../domain/buildStreamerLiveNotification.js";
import { logger } from "../../../shared/logger/logger.js";

// Bounds how many subscribers are notified concurrently so a very popular
// streamer going live doesn't fire thousands of simultaneous Firestore reads
// and notification-channel calls in one burst.
const NOTIFY_BATCH_SIZE = 25;

export class StreamNotificationService {
  constructor(
    private readonly twitch: TwitchStreamerProvider,
    private readonly users: UserRepository,
    private readonly streamers: StreamerRepository,
    private readonly notificationManager: NotificationManager,
  ) {}

  async handleStreamOnline(
    event: TwitchEventSubStreamOnlineEvent,
  ): Promise<void> {
    const streamer = await this.twitch.getStreamer(
      event.broadcaster_user_login,
    );

    if (!streamer) {
      return;
    }

    const userIds = await this.streamers.getSubscriberIds(streamer.id);

    for (let i = 0; i < userIds.length; i += NOTIFY_BATCH_SIZE) {
      const batch = userIds.slice(i, i + NOTIFY_BATCH_SIZE);

      // allSettled, not all: one subscriber's bad record or a single failed
      // notification call must not abort every later batch's delivery.
      const results = await Promise.allSettled(
        batch.map((userId) => this.notifyUserForStreamer(userId, streamer)),
      );

      for (const [index, result] of results.entries()) {
        if (result.status === "rejected") {
          logger.error(
            { userId: batch[index], streamerId: streamer.id, error: result.reason },
            "Failed to notify subscriber of stream going live",
          );
        }
      }
    }
  }

  private async notifyUserForStreamer(
    userId: string,
    streamer: TwitchStreamer,
  ): Promise<void> {
    const user = await this.users.getUser(userId);

    if (!user) {
      return;
    }

    const subscription = user.subscriptions.find((s) => s.id === streamer.id);
    const message = subscription?.notification_message || "";

    const notification = buildStreamerLivePayload({
      streamer,

      message,
    });

    await this.notificationManager.notify(user, notification);
  }
}
