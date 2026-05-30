import { logger } from "../utils/logger.js";
import { buildStreamerLivePayload } from "./NotificationPayload.js";

import type { NotificationManager } from "./NotificationManager.js";
import type { FirestoreRepository } from "../repositories/FirestoreRepository.js";
import type {
  TwitchEventSubSubscription,
  TwitchEventSubStreamOnlineEvent,
  TwitchStreamer,
} from "../types/twitch.js";
import type {
  TwitchStreamerService,
  TwitchSubscriptionService,
} from "../types/services/twitch.js";

type NotificationServiceOptions = {
  twitch: TwitchStreamerService & TwitchSubscriptionService;

  repository: FirestoreRepository;

  notificationManager: NotificationManager;
};

export class NotificationService {
  private readonly twitch: TwitchStreamerService & TwitchSubscriptionService;

  private readonly repository: FirestoreRepository;

  private readonly notificationManager: NotificationManager;

  private gcRunning = false;

  constructor({
    twitch,
    repository,
    notificationManager,
  }: NotificationServiceOptions) {
    this.twitch = twitch;

    this.repository = repository;

    this.notificationManager = notificationManager;
  }

  async syncEventSubSubscriptions(): Promise<void> {
    const [streamers, subscriptions] = await Promise.all([
      this.repository.listStreamers(),

      this.getStreamOnlineSubscriptions(),
    ]);

    for (const streamer of streamers) {
      const streamerId = streamer.id;

      const exists = subscriptions.some(
        (sub) => sub.condition?.broadcaster_user_id === streamerId,
      );

      if (!exists) {
        logger.info(`Creating Twitch EventSub subscription for ${streamerId}`);

        await this.twitch.subscribeToEvent("stream.online", {
          broadcaster_user_id: streamerId,
        });
      }
    }
  }

  async getStreamOnlineSubscriptions(): Promise<TwitchEventSubSubscription[]> {
    const subscriptions = await this.twitch.getSubscriptions();

    return subscriptions.filter(
      (subscription) => subscription.type === "stream.online",
    );
  }

  async handleStreamerAdded(streamerId: string): Promise<void> {
    const subscriptions = await this.getStreamOnlineSubscriptions();

    const exists = subscriptions.some(
      (sub) => sub.condition?.broadcaster_user_id === streamerId,
    );

    if (exists) {
      return;
    }
    logger.info(`Creating Twitch EventSub subscription for ${streamerId}`);

    await this.twitch.subscribeToEvent("stream.online", {
      broadcaster_user_id: streamerId,
    });
  }

  async handleStreamOnline(
    event: TwitchEventSubStreamOnlineEvent,
  ): Promise<void> {
    const streamer = await this.twitch.getStreamer(
      event.broadcaster_user_login,
    );

    if (!streamer) {
      return;
    }

    const streamerDocument = await this.repository.getStreamer(streamer.id);

    const userIds = streamerDocument?.users || [];

    await Promise.all(
      userIds.map((userId) => this.notifyUserForStreamer(userId, streamer)),
    );
  }

  async notifyUserForStreamer(
    userId: string,
    streamer: TwitchStreamer,
  ): Promise<void> {
    const user = await this.repository.getUser(userId);

    if (!user) {
      return;
    }

    const message = await this.repository.getNotificationMessage(
      userId,
      streamer.id,
    );

    const notification = buildStreamerLivePayload({
      streamer,

      message,
    });

    await this.notificationManager.notify(user, notification);
  }

  async garbageCollectSubscriptions(): Promise<void> {
    if (this.gcRunning) {
      return;
    }

    this.gcRunning = true;

    try {
      const subscriptions = await this.getStreamOnlineSubscriptions();

      for (const subscription of subscriptions) {
        const streamerId = subscription.condition?.broadcaster_user_id;

        if (!streamerId) {
          continue;
        }

        const streamer = await this.repository.getStreamer(streamerId);

        if (!streamer || (streamer.users || []).length === 0) {
          await this.garbageCollectStreamer(streamerId);
        }
      }
    } finally {
      this.gcRunning = false;
    }
  }

  async garbageCollectStreamer(streamerId: string): Promise<void> {
    const streamer = await this.repository.getStreamer(streamerId);

    if ((streamer?.users || []).length > 0) {
      return;
    }

    const subscriptions = await this.getStreamOnlineSubscriptions();

    const matching = subscriptions.filter(
      (sub) => sub.condition?.broadcaster_user_id === streamerId,
    );

    await Promise.all(
      matching.map((sub) => this.twitch.unsubscribeFromEvent(sub.id)),
    );

    await this.repository.deleteStreamer(streamerId);
  }
}
