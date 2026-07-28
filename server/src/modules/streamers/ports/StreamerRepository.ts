import type { Streamer } from "../domain/Streamer.js";
import type { DomainEventBus } from "../../../shared/events/DomainEventBus.js";

export interface StreamerRepository {
  /** Emits "streamerAdded" when a new streamer is created. */
  readonly events: DomainEventBus;

  getStreamers(): Promise<Streamer[]>;
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
}
