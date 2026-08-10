import type { TwitchSubscriptionProvider } from "../../twitch/ports/TwitchGateway.js";
import type { TwitchEventSubSubscription } from "../../twitch/domain/Twitch.js";
import type { StreamerRepository } from "../../streamers/ports/StreamerRepository.js";
import { TRACKED_EVENT_TYPES } from "./EventSubSyncService.js";
import type { EventSubSyncService } from "./EventSubSyncService.js";

import { eventSubSubscriptionsDeletedTotal } from "../../../infrastructure/metrics/prometheus.js";
import { logger } from "../../../shared/logger/logger.js";

type TrackedEventType = (typeof TRACKED_EVENT_TYPES)[number];

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
    // Recreating a subscription this service just deleted (see
    // collectStreamer's !deleted branch below) routes through this instead
    // of calling twitch.subscribeToEvent directly, so it shares
    // EventSubSyncService's own streamersBeingSubscribed lock and
    // exists-check - a direct call here would be a second, uncoordinated
    // creator of the same Twitch resource EventSubSyncService already
    // guards (e.g. a concurrent "streamerAdded" event or a periodic sync for
    // the same streamer), able to double-create just like collectStreamer's
    // own delete side needed streamersBeingCollected to prevent.
    private readonly eventSubSync: EventSubSyncService,
  ) {}

  async garbageCollectSubscriptions(): Promise<void> {
    if (this.gcRunning) {
      return;
    }

    this.gcRunning = true;

    try {
      const trackedSubscriptions = await this.getTrackedSubscriptions();

      const streamerIds = [
        ...new Set(
          trackedSubscriptions
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
          batch.map(async (streamerId, index) => {
            const subscriberIds = subscriberIdsByStreamer[index] ?? [];

            if (subscriberIds.length > 0) {
              return;
            }

            try {
              // Reuse the list already fetched for this sweep instead of each
              // empty streamer re-fetching the entire Twitch EventSub
              // subscription list on its own.
              await this.collectStreamer(streamerId, trackedSubscriptions);
            } catch (error) {
              // Mirrors EventSubSyncService.syncEventSubSubscriptions's same
              // per-item isolation: one streamer's Twitch API failure
              // shouldn't abort the rest of this sweep (and, since this is a
              // fixed-size batch loop, every later batch too) - self-heals
              // on the next scheduled sweep either way.
              logger.error(
                { error, streamerId },
                "Failed to garbage-collect EventSub subscription for streamer; continuing with remaining streamers",
              );
            }
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

    const trackedSubscriptions = await this.getTrackedSubscriptions();

    await this.collectStreamer(streamerId, trackedSubscriptions);
  }

  private async getTrackedSubscriptions(): Promise<
    TwitchEventSubSubscription[]
  > {
    const subscriptions = await this.twitch.getEventSubSubscriptions();

    return subscriptions.filter((subscription) =>
      TRACKED_EVENT_TYPES.includes(subscription.type as TrackedEventType),
    );
  }

  private async collectStreamer(
    streamerId: string,
    trackedSubscriptions: TwitchEventSubSubscription[],
  ): Promise<void> {
    if (this.streamersBeingCollected.has(streamerId)) {
      return;
    }

    this.streamersBeingCollected.add(streamerId);

    try {
      // Both tracked types (stream.online and stream.offline) for this
      // streamer are torn down together - they were created together by
      // EventSubSyncService.ensureSubscriptions and have no independent
      // lifecycle.
      const matching = trackedSubscriptions.filter(
        (sub) => sub.condition?.broadcaster_user_id === streamerId,
      );

      await Promise.all(
        matching.map(async (sub) => {
          await this.twitch.unsubscribeFromEvent(sub.id);

          // Only counted once the delete actually succeeded - incrementing
          // beforehand would count a failed unsubscribe as a real deletion.
          eventSubSubscriptionsDeletedTotal.inc();
        }),
      );

      // Atomic: only deletes the streamer doc if it's still subscriber-less
      // at commit time, so a subscribe() racing with this sweep can't be
      // silently wiped out by it. That guard only protects the Firestore
      // doc, though - the Twitch EventSub subscription(s) matched above were
      // already deleted unconditionally, before this re-check. If a
      // subscribe() lands in that window (a real gap: at least one Twitch
      // API round trip earlier), the streamer doc correctly survives but its
      // live-notification subscription doesn't - and nothing else recreates
      // a missing subscription for a non-empty streamer until the next full
      // sync (which only runs on process start or an infrequent token
      // refresh). Recreate it immediately when that happens instead of
      // silently losing notifications for whoever just subscribed.
      const deleted = await this.streamers.deleteStreamerIfEmpty(streamerId);

      // Deliberately not gated on `matching.length > 0`: a streamer can
      // reach this point with zero matching subscriptions for reasons other
      // than "this call just deleted the last one" - e.g. a subscribe whose
      // own streamerAdded-triggered create is still in flight (domain events
      // are dispatched asynchronously, not awaited by the transaction that
      // emits them) when the same user immediately unsubscribes, followed by
      // a different user subscribing before this transaction commits. In
      // that case `matching` was already empty, but the streamer is
      // genuinely non-empty now and still needs a subscription.
      // handleStreamerAdded's own exists-check (a fresh Twitch read) makes
      // this a safe no-op on the (usual) case where one already exists.
      if (!deleted) {
        logger.warn(
          { streamerId },
          "Streamer gained a subscriber while it was being garbage-collected; ensuring it has an EventSub subscription",
        );

        // Not a direct twitch.subscribeToEvent call - see the constructor
        // comment on eventSubSync for why this needs to share
        // EventSubSyncService's own lock/exists-check instead of creating a
        // second, uncoordinated subscription for the same streamer.
        await this.eventSubSync.handleStreamerAdded(streamerId);
      }
    } finally {
      this.streamersBeingCollected.delete(streamerId);
    }
  }
}
