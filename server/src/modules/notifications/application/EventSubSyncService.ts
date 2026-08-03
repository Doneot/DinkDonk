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
  // handleStreamerAdded (the "streamerAdded" domain event) and
  // syncEventSubSubscriptions (the periodic sweep / "ready"/"tokenRefreshed"
  // handlers) can both observe "no subscription exists yet for this
  // streamer" concurrently and both attempt to create one - same race
  // SubscriptionCleanupService.streamersBeingCollected guards against for
  // deletes, mirrored here for creates.
  private readonly streamersBeingSubscribed = new Set<string>();

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

  // Accepted, bounded debt: if the streamer this creates a subscription for
  // becomes empty again (its one subscriber immediately unsubscribes) before
  // this call's Twitch API round trip completes, the create can land against
  // an already-empty streamer, leaving an orphaned subscription with no
  // Firestore doc to reassociate it with. Unlike the write-before-fallible-
  // operation races elsewhere in this file's history, this one is
  // self-healing without intervention: garbageCollectSubscriptions' periodic
  // sweep enumerates streamer ids from Twitch's live subscription list
  // directly (not from Firestore), so it finds and removes this orphan on
  // its own within one EVENTSUB_GC_INTERVAL_MS window - no notifications are
  // lost, just a temporarily wasted subscription slot.
  async handleStreamerAdded(streamerId: string): Promise<void> {
    const subscriptions = await this.getStreamOnlineSubscriptions();

    await this.ensureSubscription(streamerId, subscriptions);
  }

  private hasActiveSubscription(
    streamerId: string,
    subscriptions: TwitchEventSubSubscription[],
  ): boolean {
    return subscriptions.some(
      (sub) =>
        sub.condition?.broadcaster_user_id === streamerId &&
        !DEAD_SUBSCRIPTION_STATUSES.has(sub.status),
    );
  }

  private async ensureSubscription(
    streamerId: string,
    subscriptions: TwitchEventSubSubscription[],
  ): Promise<void> {
    if (
      this.hasActiveSubscription(streamerId, subscriptions) ||
      this.streamersBeingSubscribed.has(streamerId)
    ) {
      return;
    }

    this.streamersBeingSubscribed.add(streamerId);

    try {
      // `subscriptions` above was captured by this call's caller (the
      // periodic sync sweep, or handleStreamerAdded) - possibly seconds
      // earlier for the sweep, which fetches its snapshot once up front and
      // then works through streamers in batches. The lock above only
      // prevents two callers from *overlapping* on the same streamerId; it
      // doesn't stop one from acting on a snapshot that predates another
      // caller's already-completed (lock acquired, subscribed, released)
      // create for that same streamer. Re-checking against a fresh read,
      // now that this call exclusively holds the lock for this streamerId,
      // closes that gap - any such create would already be reflected here.
      const fresh = await this.getStreamOnlineSubscriptions();

      if (this.hasActiveSubscription(streamerId, fresh)) {
        return;
      }

      logger.info({ streamerId }, "Creating Twitch EventSub subscription");

      await this.twitch.subscribeToEvent("stream.online", {
        broadcaster_user_id: streamerId,
      });

      // Only counted once the create actually succeeded - incrementing
      // beforehand would count a failed/duplicate-rejected attempt as a
      // real creation.
      eventSubSubscriptionsCreatedTotal.inc();
    } finally {
      this.streamersBeingSubscribed.delete(streamerId);
    }
  }
}
