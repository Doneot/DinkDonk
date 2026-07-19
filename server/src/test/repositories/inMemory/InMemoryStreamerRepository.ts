import { EventEmitter } from "node:events";

import type { StreamerRepository } from "../../../modules/streamers/ports/StreamerRepository.js";
import type { Streamer } from "../../../modules/streamers/domain/Streamer.js";

import { isNonEmptyString } from "../../../shared/utils/validators.js";

export class InMemoryStreamerRepository
  extends EventEmitter
  implements StreamerRepository
{
  private readonly streamers = new Map<string, Streamer>();

  async getStreamers(): Promise<Streamer[]> {
    return [...this.streamers.values()];
  }

  async getStreamer(id: string): Promise<Streamer | null> {
    if (!isNonEmptyString(id)) {
      return null;
    }

    return this.streamers.get(id) ?? null;
  }

  async createStreamer(id: string): Promise<void> {
    const existing = this.streamers.get(id);

    this.streamers.set(id, {
      id,
      users: existing?.users ?? [],
    });

    this.emit("streamerAdded", id);
  }

  async deleteStreamer(id: string): Promise<void> {
    if (!isNonEmptyString(id)) {
      return;
    }

    this.streamers.delete(id);
  }

  seed(streamer: Streamer): void {
    this.streamers.set(streamer.id, structuredClone(streamer));
  }

  clear(): void {
    this.streamers.clear();
  }
}
