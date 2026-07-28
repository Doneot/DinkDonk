import type { TwitchEventSubSubscription } from "../../twitch/domain/Twitch.js";
import type { TwitchSubscriptionProvider } from "../../twitch/ports/TwitchGateway.js";
import type { StreamerRepository } from "../../streamers/ports/StreamerRepository.js";

import { eventSubSubscriptionsCreatedTotal } from "../../../infrastructure/metrics/prometheus.js";

import { logger } from "../../../shared/logger/logger.js";

export class EventSubSyncService {
  constructor(
    private readonly twitch: TwitchSubscriptionProvider,
    private readonly streamers: StreamerRepository,
  ) {}

  async syncEventSubSubscriptions(): Promise<void> {
    const [streamers, subscriptions] = await Promise.all([
      this.streamers.getStreamers(),

      this.getStreamOnlineSubscriptions(),
    ]);

    for (const streamer of streamers) {
      await this.ensureSubscription(streamer.id, subscriptions);
    }
  }

  async getStreamOnlineSubscriptions(): Promise<TwitchEventSubSubscription[]> {
    const subscriptions = await this.twitch.getEventSubSubscriptions();

    return subscriptions.filter(
      (subscription) => subscription.type === "stream.online",
    );
  }

  async handleStreamerAdded(streamerId: string): Promise<void> {
    const subscriptions = await this.getStreamOnlineSubscriptions();

    await this.ensureSubscription(streamerId, subscriptions);
  }

  private async ensureSubscription(
    streamerId: string,
    subscriptions: TwitchEventSubSubscription[],
  ): Promise<void> {
    const exists = subscriptions.some(
      (sub) => sub.condition?.broadcaster_user_id === streamerId,
    );

    if (exists) {
      return;
    }

    eventSubSubscriptionsCreatedTotal.inc();

    logger.info(`Creating Twitch EventSub subscription for ${streamerId}`);

    await this.twitch.subscribeToEvent("stream.online", {
      broadcaster_user_id: streamerId,
    });
  }
}
