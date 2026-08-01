import type { TwitchEventSubSubscription } from "../../twitch/domain/Twitch.js";
import type { TwitchSubscriptionProvider } from "../../twitch/ports/TwitchGateway.js";
import type { StreamerRepository } from "../../streamers/ports/StreamerRepository.js";

import { eventSubSubscriptionsCreatedTotal } from "../../../infrastructure/metrics/prometheus.js";

import { logger } from "../../../shared/logger/logger.js";

/**
 * Twitch EventSub subscription statuses that mean the subscription is no
 * longer delivering events, even though it still appears in the list
 * response until explicitly deleted. A subscription in one of these states
 * must be treated as "missing" so it gets recreated.
 */
const DEAD_SUBSCRIPTION_STATUSES = new Set([
  "authorization_revoked",
  "user_removed",
  "version_removed",
  "notification_failures_exceeded",
  "websocket_disconnected",
  "failed_to_connect",
]);

// Mirrors SubscriptionCleanupService's batching: bounds how many
// ensureSubscription calls run concurrently so a cold start or a bulk
// EventSub revocation needing many new subscriptions at once doesn't fire
// hundreds of simultaneous Twitch API calls in one burst.
const SYNC_BATCH_SIZE = 25;

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

    for (let i = 0; i < streamers.length; i += SYNC_BATCH_SIZE) {
      const batch = streamers.slice(i, i + SYNC_BATCH_SIZE);

      await Promise.all(
        batch.map(async (streamer) => {
          try {
            await this.ensureSubscription(streamer.id, subscriptions);
          } catch (error) {
            logger.error(
              { error, streamerId: streamer.id },
              "Failed to sync EventSub subscription for streamer; continuing with remaining streamers",
            );
          }
        }),
      );
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
      (sub) =>
        sub.condition?.broadcaster_user_id === streamerId &&
        !DEAD_SUBSCRIPTION_STATUSES.has(sub.status),
    );

    if (exists) {
      return;
    }

    eventSubSubscriptionsCreatedTotal.inc();

    logger.info({ streamerId }, "Creating Twitch EventSub subscription");

    await this.twitch.subscribeToEvent("stream.online", {
      broadcaster_user_id: streamerId,
    });
  }
}
