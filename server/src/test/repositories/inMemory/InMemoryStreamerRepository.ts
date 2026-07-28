import { EventEmitter } from "node:events";

import type { StreamerRepository } from "../../../modules/streamers/ports/StreamerRepository.js";
import type { Streamer } from "../../../modules/streamers/domain/Streamer.js";

import { isNonEmptyString } from "../../../shared/utils/validators.js";

export class InMemoryStreamerRepository
  extends EventEmitter
  implements StreamerRepository
{
  private readonly streamers = new Map<string, Streamer>();

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
    this.streamers.set(id, {
      id,
      users: [],
    });

    this.emit("streamerAdded", id);

    return Promise.resolve();
  }

  deleteStreamer(id: string): Promise<void> {
    if (!isNonEmptyString(id)) {
      return Promise.resolve();
    }

    this.streamers.delete(id);

    return Promise.resolve();
  }

  seed(streamer: Streamer): void {
    this.streamers.set(streamer.id, structuredClone(streamer));
  }

  clear(): void {
    this.streamers.clear();
  }
}
