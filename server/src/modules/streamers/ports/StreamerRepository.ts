import type { Streamer } from "../domain/Streamer.js";
import type { DomainEventBus } from "../../../shared/events/DomainEventBus.js";

export interface StreamerRepository {
  /** Emits "streamerAdded" when a new streamer is created. */
  readonly events: DomainEventBus;

  /**
   * Unlike UserRepository.getUsers(), `limit` doesn't default to a cap when
   * omitted: EventSubSyncService's periodic sync is a real production
   * caller that needs the complete streamer set to keep every streamer's
   * EventSub subscription alive, so silently truncating it would be a
   * functional regression, not just a performance one. Callers that only
   * need a bounded page (e.g. future admin tooling) can pass one explicitly.
   */
  getStreamers(limit?: number): Promise<Streamer[]>;
  getStreamer(id: string): Promise<Streamer | null>;
  createStreamer(id: string): Promise<void>;
  deleteStreamer(id: string): Promise<void>;

  /** Ids of the users currently subscribed to this streamer. */
  getSubscriberIds(id: string): Promise<string[]>;

  /**
   * Atomically deletes the streamer only if it currently has no
   * subscribers, returning whether it was deleted. Backed by a transaction
   * so a subscriber added concurrently with a cleanup sweep can't be
   * silently wiped out by it.
   */
  deleteStreamerIfEmpty(id: string): Promise<boolean>;

  /**
   * Records a stream.online/stream.offline transition. Returns false
   * without writing anything when the streamer doc doesn't exist (e.g. a
   * late-arriving event for a streamer whose last subscriber already left
   * and was garbage-collected) - the caller uses this to decide whether
   * there's anyone to fan the change out to over Socket.IO.
   */
  setLiveState(
    id: string,
    isLive: boolean,
    liveSince: string | null,
  ): Promise<boolean>;
}
