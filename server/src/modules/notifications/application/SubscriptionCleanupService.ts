import type { TwitchSubscriptionProvider } from "../../twitch/ports/TwitchGateway.js";
import type { TwitchEventSubSubscription } from "../../twitch/domain/Twitch.js";
import type { StreamerRepository } from "../../streamers/ports/StreamerRepository.js";

import { eventSubSubscriptionsDeletedTotal } from "../../../infrastructure/metrics/prometheus.js";

export class SubscriptionCleanupService {
  private gcRunning = false;

  constructor(
    private readonly twitch: TwitchSubscriptionProvider,
    private readonly streamers: StreamerRepository,
  ) {}

  async garbageCollectSubscriptions(): Promise<void> {
    if (this.gcRunning) {
      return;
    }

    this.gcRunning = true;

    try {
      const streamOnlineSubscriptions =
        await this.getStreamOnlineSubscriptions();

      for (const subscription of streamOnlineSubscriptions) {
        const streamerId = subscription.condition?.broadcaster_user_id;

        if (!streamerId) {
          continue;
        }

        const subscriberIds = await this.streamers.getSubscriberIds(
          streamerId,
        );

        if (subscriberIds.length === 0) {
          // Reuse the list already fetched for this sweep instead of each
          // empty streamer re-fetching the entire Twitch EventSub
          // subscription list on its own.
          await this.collectStreamer(streamerId, streamOnlineSubscriptions);
        }
      }
    } finally {
      this.gcRunning = false;
    }
  }

  async garbageCollectStreamer(streamerId: string): Promise<void> {
    const subscriberIds = await this.streamers.getSubscriberIds(streamerId);

    if (subscriberIds.length > 0) {
      return;
    }

    const streamOnlineSubscriptions =
      await this.getStreamOnlineSubscriptions();

    await this.collectStreamer(streamerId, streamOnlineSubscriptions);
  }

  private async getStreamOnlineSubscriptions(): Promise<
    TwitchEventSubSubscription[]
  > {
    const subscriptions = await this.twitch.getEventSubSubscriptions();

    return subscriptions.filter(
      (subscription) => subscription.type === "stream.online",
    );
  }

  private async collectStreamer(
    streamerId: string,
    streamOnlineSubscriptions: TwitchEventSubSubscription[],
  ): Promise<void> {
    const matching = streamOnlineSubscriptions.filter(
      (sub) => sub.condition?.broadcaster_user_id === streamerId,
    );

    await Promise.all(
      matching.map((sub) => {
        eventSubSubscriptionsDeletedTotal.inc();
        return this.twitch.unsubscribeFromEvent(sub.id);
      }),
    );

    // Atomic: only deletes if the streamer is still subscriber-less at
    // commit time, so a subscribe() racing with this sweep can't be
    // silently wiped out by it.
    await this.streamers.deleteStreamerIfEmpty(streamerId);
  }
}
