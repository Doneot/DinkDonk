import type { TwitchSubscriptionProvider } from "../../twitch/ports/TwitchGateway.js";
import type { TwitchEventSubSubscription } from "../../twitch/domain/Twitch.js";
import type { StreamerRepository } from "../../streamers/ports/StreamerRepository.js";

import { eventSubSubscriptionsDeletedTotal } from "../../../infrastructure/metrics/prometheus.js";

// Bounds how many streamers' subscriber lists are read concurrently in one
// sweep, so a large backlog of stream.online subscriptions doesn't fire
// hundreds of simultaneous Firestore reads in a single burst.
const CLEANUP_BATCH_SIZE = 25;

export class SubscriptionCleanupService {
  private gcRunning = false;

  // Both garbageCollectSubscriptions (the periodic sweep) and
  // garbageCollectStreamer (triggered directly by the "streamerEmpty" event)
  // funnel into collectStreamer for the same streamer id when they overlap;
  // the Twitch DELETE call is idempotent either way, but without this the
  // "deleted" metric double-counts under that race.
  private readonly streamersBeingCollected = new Set<string>();

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

      const streamerIds = [
        ...new Set(
          streamOnlineSubscriptions
            .map((sub) => sub.condition?.broadcaster_user_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      for (let i = 0; i < streamerIds.length; i += CLEANUP_BATCH_SIZE) {
        const batch = streamerIds.slice(i, i + CLEANUP_BATCH_SIZE);

        const subscriberIdsByStreamer = await Promise.all(
          batch.map((streamerId) => this.streamers.getSubscriberIds(streamerId)),
        );

        await Promise.all(
          batch.map((streamerId, index) => {
            const subscriberIds = subscriberIdsByStreamer[index] ?? [];

            if (subscriberIds.length > 0) {
              return Promise.resolve();
            }

            // Reuse the list already fetched for this sweep instead of each
            // empty streamer re-fetching the entire Twitch EventSub
            // subscription list on its own.
            return this.collectStreamer(streamerId, streamOnlineSubscriptions);
          }),
        );
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
    if (this.streamersBeingCollected.has(streamerId)) {
      return;
    }

    this.streamersBeingCollected.add(streamerId);

    try {
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
    } finally {
      this.streamersBeingCollected.delete(streamerId);
    }
  }
}
