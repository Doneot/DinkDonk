import type { StreamerRepository } from "../../../modules/streamers/ports/StreamerRepository.js";
import type { Streamer } from "../../../modules/streamers/domain/Streamer.js";
import type { DomainEventBus } from "../../../shared/events/DomainEventBus.js";
import { createDomainEventBus } from "../../../shared/events/DomainEventBus.js";
import { logger } from "../../../shared/logger/logger.js";

import { isNonEmptyString } from "../../../shared/utils/validators.js";

export class InMemoryStreamerRepository implements StreamerRepository {
  private readonly streamers = new Map<string, Streamer>();
  private readonly subscribers = new Map<string, Set<string>>();

  constructor(readonly events: DomainEventBus = createDomainEventBus(logger)) {}

  getStreamers(): Promise<Streamer[]> {
    return Promise.resolve([...this.streamers.values()]);
  }

  getStreamer(id: string): Promise<Streamer | null> {
    if (!isNonEmptyString(id)) {
      return Promise.resolve(null);
    }

    return Promise.resolve(this.streamers.get(id) ?? null);
  }

  createStreamer(id: string): Promise<void> {
    this.streamers.set(id, { id });
    this.subscribers.set(id, this.subscribers.get(id) ?? new Set());

    this.events.emit({ type: "streamerAdded", streamerId: id });

    return Promise.resolve();
  }

  deleteStreamer(id: string): Promise<void> {
    if (!isNonEmptyString(id)) {
      return Promise.resolve();
    }

    this.streamers.delete(id);
    this.subscribers.delete(id);

    return Promise.resolve();
  }

  getSubscriberIds(id: string): Promise<string[]> {
    if (!isNonEmptyString(id)) {
      return Promise.resolve([]);
    }

    return Promise.resolve([...(this.subscribers.get(id) ?? [])]);
  }

  deleteStreamerIfEmpty(id: string): Promise<boolean> {
    if (!isNonEmptyString(id)) {
      return Promise.resolve(false);
    }

    const subscribers = this.subscribers.get(id);

    if (subscribers && subscribers.size > 0) {
      return Promise.resolve(false);
    }

    this.streamers.delete(id);
    this.subscribers.delete(id);

    return Promise.resolve(true);
  }

  /**
   * `users` is a test-only convenience for seeding which users are already
   * subscribed to this streamer (mirroring the `subscribers` subcollection
   * Firestore uses); it isn't part of the `Streamer` domain type.
   */
  seed(streamer: Streamer & { users?: string[] }): void {
    const { users, ...rest } = streamer;

    this.streamers.set(rest.id, structuredClone(rest));
    this.subscribers.set(rest.id, new Set(users ?? []));
  }

  clear(): void {
    this.streamers.clear();
    this.subscribers.clear();
  }
}
