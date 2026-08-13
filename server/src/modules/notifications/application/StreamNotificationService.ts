import { logger } from "../../../shared/logger/logger.js";
import type { StreamerRepository } from "../../streamers/ports/StreamerRepository.js";
import type {
  TwitchEventSubStreamOnlineEvent,
  TwitchStreamer,
} from "../../twitch/domain/Twitch.js";
import type { TwitchStreamerProvider } from "../../twitch/ports/TwitchGateway.js";
import type { User } from "../../users/domain/User.js";
import type { UserRepository } from "../../users/ports/UserRepository.js";
import { buildStreamerLivePayload } from "../domain/buildStreamerLiveNotification.js";
import type { NotificationManager } from "./NotificationManager.js";

// Bounds how many subscribers are notified concurrently so a very popular
// streamer going live doesn't fire thousands of simultaneous Firestore reads
// and notification-channel calls in one burst.
const NOTIFY_BATCH_SIZE = 25;

// Twitch can send distinct stream.online notifications in quick succession
// for the same broadcast (e.g. a brief drop/reconnect "flapping"), which
// InMemoryReplayStore's message-id dedup can't catch since each delivery has
// a genuinely different message id. Track the most recent started_at we've
// already notified subscribers for, per streamer, and skip re-notifying for
// the same (or a near-identical) stream session. In-memory and best-effort -
// this guards a UX nicety against a rare edge case, not a correctness
// guarantee.
const FLAP_DEDUP_WINDOW_MS = 10 * 60 * 1000;

// Without a sweep, every distinct streamer that has ever gone live would
// leave a permanent entry here for the life of the process (nothing removes
// one once its dedup window has passed) - unbounded growth on a long-running
// instance as the streamer catalog churns.
const DEDUP_SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export class StreamNotificationService {
  private readonly lastNotifiedStartedAt = new Map<string, string>();

  constructor(
    private readonly twitch: TwitchStreamerProvider,
    private readonly users: UserRepository,
    private readonly streamers: StreamerRepository,
    private readonly notificationManager: NotificationManager,
  ) {
    const sweep: NodeJS.Timeout = setInterval(() => {
      const now = Date.now();

      for (const [streamerId, startedAt] of this.lastNotifiedStartedAt) {
        const startedAtMs = Date.parse(startedAt);

        if (
          !Number.isFinite(startedAtMs) ||
          now - startedAtMs >= FLAP_DEDUP_WINDOW_MS
        ) {
          this.lastNotifiedStartedAt.delete(streamerId);
        }
      }
    }, DEDUP_SWEEP_INTERVAL_MS);

    sweep.unref();
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

    if (this.isDuplicateStreamSession(streamer.id, event.started_at)) {
      logger.info(
        { streamerId: streamer.id, startedAt: event.started_at },
        "Skipping duplicate stream.online notification for the same stream session",
      );

      return;
    }

    // Claimed synchronously, immediately after the duplicate check above
    // with no `await` in between - two concurrent stream.online deliveries
    // for the same session (distinct Twitch message ids, so ReplayStore
    // doesn't dedup them - a real "brief drop/reconnect" scenario, exactly
    // what this map exists to guard against) would otherwise both pass the
    // check above before either claimed it. Rolled back below only if
    // getSubscriberIds itself fails, so a genuine Firestore hiccup doesn't
    // permanently poison the map against a legitimate retry (Twitch retries
    // with a new message id, but the same started_at) - see the error
    // handler.
    this.lastNotifiedStartedAt.set(streamer.id, event.started_at);

    let userIds: string[];

    try {
      userIds = await this.streamers.getSubscriberIds(streamer.id);
    } catch (error) {
      // Only roll back if nothing has since superseded this entry - a
      // genuinely new stream session for the same streamer could have
      // already overwritten it while this fetch was in flight.
      if (this.lastNotifiedStartedAt.get(streamer.id) === event.started_at) {
        this.lastNotifiedStartedAt.delete(streamer.id);
      }

      throw error;
    }

    for (let i = 0; i < userIds.length; i += NOTIFY_BATCH_SIZE) {
      const batch = userIds.slice(i, i + NOTIFY_BATCH_SIZE);

      // Batched multi-get instead of one getUser() per subscriber: for a
      // popular streamer this is the difference between ~1 Firestore round
      // trip per 300 subscribers and 1 per subscriber, which otherwise
      // dominates fan-out latency for the single most time-sensitive
      // notification in the product.
      let users: User[];

      try {
        users = await this.users.getUsersByIds(batch);
      } catch (error) {
        // A whole batch's read failing (e.g. a Firestore outage) shouldn't
        // abort later batches' delivery, mirroring the per-item isolation
        // this loop already gives notification sends below.
        logger.error(
          { userIds: batch, streamerId: streamer.id, error },
          "Failed to load a batch of subscribers to notify of stream going live",
        );

        continue;
      }

      const usersById = new Map(users.map((user) => [user.id, user]));

      // allSettled, not all: one failed notification call must not abort
      // the rest of this batch's delivery.
      const results = await Promise.allSettled(
        batch.map((userId) => {
          const user = usersById.get(userId);

          return user
            ? this.notifyUser(user, streamer)
            : Promise.resolve();
        }),
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

  private isDuplicateStreamSession(
    streamerId: string,
    startedAt: string,
  ): boolean {
    const lastStartedAt = this.lastNotifiedStartedAt.get(streamerId);

    if (!lastStartedAt) {
      return false;
    }

    const lastMs = Date.parse(lastStartedAt);
    const currentMs = Date.parse(startedAt);

    if (!Number.isFinite(lastMs) || !Number.isFinite(currentMs)) {
      return false;
    }

    return Math.abs(currentMs - lastMs) < FLAP_DEDUP_WINDOW_MS;
  }

  private async notifyUser(
    user: User,
    streamer: TwitchStreamer,
  ): Promise<void> {
    const subscription = user.subscriptions.find((s) => s.id === streamer.id);
    const message = subscription?.notification_message || "";

    const notification = buildStreamerLivePayload({
      streamer,

      message,
    });

    await this.notificationManager.notify(user, notification);
  }
}
