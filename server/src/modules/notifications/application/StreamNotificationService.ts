import type { TwitchStreamerProvider } from "../../twitch/ports/TwitchGateway.js";
import type { UserRepository } from "../../users/ports/UserRepository.js";
import type { StreamerRepository } from "../../streamers/ports/StreamerRepository.js";
import type { SubscriptionRepository } from "../../subscriptions/ports/SubscriptionRepository.js";
import type { NotificationManager } from "./NotificationManager.js";
import type {
  TwitchEventSubStreamOnlineEvent,
  TwitchStreamer,
} from "../../twitch/domain/Twitch.js";
import { buildStreamerLivePayload } from "../domain/buildStreamerLiveNotification.js";

export class StreamNotificationService {
  constructor(
    private readonly twitch: TwitchStreamerProvider,
    private readonly users: UserRepository,
    private readonly streamers: StreamerRepository,
    private readonly subscriptionRepository: SubscriptionRepository,
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

    const streamerDocument = await this.streamers.getStreamer(streamer.id);

    const userIds = streamerDocument?.users || [];

    await Promise.all(
      userIds.map((userId) => this.notifyUserForStreamer(userId, streamer)),
    );
  }

  private async notifyUserForStreamer(
    userId: string,
    streamer: TwitchStreamer,
  ): Promise<void> {
    const user = await this.users.getUser(userId);

    if (!user) {
      return;
    }

    const subscription = await this.subscriptionRepository.getSubscription(
      userId,
      streamer.id,
    );
    const message = subscription?.notification_message || "";

    const notification = buildStreamerLivePayload({
      streamer,

      message,
    });

    await this.notificationManager.notify(user, notification);
  }
}
