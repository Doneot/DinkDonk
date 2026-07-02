import type { TwitchSubscriptionProvider } from "../../twitch/ports/TwitchGateway.js";
import type { StreamerRepository } from "../../streamers/ports/StreamerRepository.js";

import { subscriptionsDeletedTotal } from "../../../infrastructure/metrics/prometheus.js";

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
      const subscriptions = await this.twitch.getEventSubSubscriptions();

      const streamOnlineSubscriptions = subscriptions.filter(
        (subscription) => subscription.type === "stream.online",
      );

      for (const subscription of streamOnlineSubscriptions) {
        const streamerId = subscription.condition?.broadcaster_user_id;

        if (!streamerId) {
          continue;
        }

        const streamer = await this.streamers.getStreamer(streamerId);

        if (!streamer || (streamer.users || []).length === 0) {
          await this.garbageCollectStreamer(streamerId);
        }
      }
    } finally {
      this.gcRunning = false;
    }
  }

  async garbageCollectStreamer(streamerId: string): Promise<void> {
    const streamer = await this.streamers.getStreamer(streamerId);

    if ((streamer?.users || []).length > 0) {
      return;
    }

    const subscriptions = await this.twitch.getEventSubSubscriptions();

    const streamOnlineSubscriptions = subscriptions.filter(
      (subscription) => subscription.type === "stream.online",
    );

    const matching = streamOnlineSubscriptions.filter(
      (sub) => sub.condition?.broadcaster_user_id === streamerId,
    );

    await Promise.all(
      matching.map((sub) => {
        subscriptionsDeletedTotal.inc();
        return this.twitch.unsubscribeFromEvent(sub.id);
      }),
    );

    await this.streamers.deleteStreamer(streamerId);
  }
}
