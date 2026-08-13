import type {
  TwitchEventSubStreamOfflineEvent,
  TwitchEventSubStreamOnlineEvent,
} from "../../twitch/domain/Twitch.js";
import type { StreamerRepository } from "../ports/StreamerRepository.js";

// A plain function rather than a socketServer/SocketServer dependency: this
// service is constructed inside app/container (before the HTTP/Socket.IO
// server exists - see server.ts), the same ordering problem server.ts's own
// `disconnectUser` indirection already solves. The container wires this to a
// late-bound notifier that starts as a no-op and is pointed at the real
// socket server once one exists.
export type SocketNotifier = (
  userId: string,
  event: string,
  payload: unknown,
) => void;

export type StreamerLiveChangedPayload = {
  streamerId: string;
  isLive: boolean;
  liveSince: string | null;
};

export class StreamerLiveStateService {
  constructor(
    private readonly streamers: StreamerRepository,
    private readonly notifySocketUser: SocketNotifier,
  ) {}

  async handleStreamOnline(
    event: TwitchEventSubStreamOnlineEvent,
  ): Promise<void> {
    await this.reconcileLiveState(
      event.broadcaster_user_id,
      true,
      event.started_at,
    );
  }

  async handleStreamOffline(
    event: TwitchEventSubStreamOfflineEvent,
  ): Promise<void> {
    await this.reconcileLiveState(event.broadcaster_user_id, false, null);
  }

  /**
   * Persists a live-state value and fans it out to every current subscriber
   * over Socket.IO. Public (not just the two EventSub-shaped handlers above)
   * because it's also the correction path for a case EventSub structurally
   * can't cover: a streamer already live before this app ever subscribed to
   * their events, so no stream.online webhook will ever arrive for their
   * already-in-progress broadcast - see apiRoutes.ts's /streamers/info,
   * which reconciles against Twitch's own "who's live right now" endpoint.
   */
  async reconcileLiveState(
    streamerId: string,
    isLive: boolean,
    liveSince: string | null,
  ): Promise<void> {
    // event.broadcaster_user_id is already this app's own Streamer.id
    // (the Firestore streamers collection is keyed by the Twitch
    // broadcaster id - see EventSubSyncService.ensureSubscriptions), so
    // this never needs a Twitch API round trip just to resolve one.
    const updated = await this.streamers.setLiveState(
      streamerId,
      isLive,
      liveSince,
    );

    if (!updated) {
      // No streamer doc to update - e.g. a late-arriving event for a
      // streamer whose last subscriber already left and was garbage
      // collected. Nobody to notify either way.
      return;
    }

    const subscriberIds = await this.streamers.getSubscriberIds(streamerId);

    const payload: StreamerLiveChangedPayload = {
      streamerId,
      isLive,
      liveSince,
    };

    for (const userId of subscriberIds) {
      this.notifySocketUser(userId, "streamer_live_changed", payload);
    }
  }
}
