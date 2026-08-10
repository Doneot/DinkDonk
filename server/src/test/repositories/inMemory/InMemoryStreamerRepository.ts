import type { StreamerRepository } from "../../../modules/streamers/ports/StreamerRepository.js";
import type { Streamer } from "../../../modules/streamers/domain/Streamer.js";
import type { DomainEventBus } from "../../../shared/events/DomainEventBus.js";
import { createDomainEventBus } from "../../../shared/events/DomainEventBus.js";
import { logger } from "../../../shared/logger/logger.js";

import { isNonEmptyString } from "../../../shared/utils/validators.js";
import { InMemorySubscriberStore } from "./InMemorySubscriberStore.js";

export class InMemoryStreamerRepository implements StreamerRepository {
  private readonly streamers = new Map<string, Streamer>();

  constructor(
    readonly events: DomainEventBus = createDomainEventBus(logger),
    private readonly subscribers: InMemorySubscriberStore = new InMemorySubscriberStore(),
  ) {}

  getStreamers(limit?: number): Promise<Streamer[]> {
    const all = [...this.streamers.values()];

    return Promise.resolve(limit === undefined ? all : all.slice(0, limit));
  }

  getStreamer(id: string): Promise<Streamer | null> {
    if (!isNonEmptyString(id)) {
      return Promise.resolve(null);
    }

    return Promise.resolve(this.streamers.get(id) ?? null);
  }

  createStreamer(id: string): Promise<void> {
    const created = !this.streamers.has(id);

    this.streamers.set(id, { id, isLive: false, liveSince: null });
    this.subscribers.ensure(id);

    if (created) {
      this.events.emit({ type: "streamerAdded", streamerId: id });
    }

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

    return Promise.resolve(this.subscribers.get(id));
  }

  deleteStreamerIfEmpty(id: string): Promise<boolean> {
    if (!isNonEmptyString(id)) {
      return Promise.resolve(false);
    }

    if (this.subscribers.get(id).length > 0) {
      return Promise.resolve(false);
    }

    this.streamers.delete(id);
    this.subscribers.delete(id);

    return Promise.resolve(true);
  }

  setLiveState(
    id: string,
    isLive: boolean,
    liveSince: string | null,
  ): Promise<boolean> {
    if (!isNonEmptyString(id)) {
      return Promise.resolve(false);
    }

    const streamer = this.streamers.get(id);

    if (!streamer) {
      return Promise.resolve(false);
    }

    this.streamers.set(id, { ...streamer, isLive, liveSince });

    return Promise.resolve(true);
  }

  /**
   * `users` is a test-only convenience for seeding which users are already
   * subscribed to this streamer (mirroring the `subscribers` subcollection
   * Firestore uses); it isn't part of the `Streamer` domain type.
   */
  seed(streamer: Partial<Streamer> & { id: string; users?: string[] }): void {
    const { users, ...rest } = streamer;

    this.streamers.set(rest.id, {
      isLive: false,
      liveSince: null,
      ...structuredClone(rest),
    });
    this.subscribers.seed(rest.id, users ?? []);
  }

  clear(): void {
    this.streamers.clear();
    this.subscribers.clear();
  }
}
