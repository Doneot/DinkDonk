import type { TwitchStreamerProvider } from "../../twitch/ports/TwitchGateway.js";
import type { UserRepository } from "../../users/ports/UserRepository.js";
import type { StreamerRepository } from "../../streamers/ports/StreamerRepository.js";
import type { NotificationManager } from "./NotificationManager.js";
import type {
  TwitchEventSubStreamOnlineEvent,
  TwitchStreamer,
} from "../../twitch/domain/Twitch.js";
import { buildStreamerLivePayload } from "../domain/buildStreamerLiveNotification.js";
import { logger } from "../../../shared/logger/logger.js";

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

export class StreamNotificationService {
  private readonly lastNotifiedStartedAt = new Map<string, string>();

  constructor(
    private readonly twitch: TwitchStreamerProvider,
    private readonly users: UserRepository,
    private readonly streamers: StreamerRepository,
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

    if (this.isDuplicateStreamSession(streamer.id, event.started_at)) {
      logger.info(
        { streamerId: streamer.id, startedAt: event.started_at },
        "Skipping duplicate stream.online notification for the same stream session",
      );

      return;
    }

    this.lastNotifiedStartedAt.set(streamer.id, event.started_at);

    const userIds = await this.streamers.getSubscriberIds(streamer.id);

    for (let i = 0; i < userIds.length; i += NOTIFY_BATCH_SIZE) {
      const batch = userIds.slice(i, i + NOTIFY_BATCH_SIZE);

      // allSettled, not all: one subscriber's bad record or a single failed
      // notification call must not abort every later batch's delivery.
      const results = await Promise.allSettled(
        batch.map((userId) => this.notifyUserForStreamer(userId, streamer)),
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

  private async notifyUserForStreamer(
    userId: string,
    streamer: TwitchStreamer,
  ): Promise<void> {
    const user = await this.users.getUser(userId);

    if (!user) {
      return;
    }

    const subscription = user.subscriptions.find((s) => s.id === streamer.id);
    const message = subscription?.notification_message || "";

    const notification = buildStreamerLivePayload({
      streamer,

      message,
    });

    await this.notificationManager.notify(user, notification);
  }
}
