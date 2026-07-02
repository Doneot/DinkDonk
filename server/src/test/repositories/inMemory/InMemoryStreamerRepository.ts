import { EventEmitter } from "node:events";

import type { StreamerRepository } from "../../../modules/streamers/ports/StreamerRepository.js";
import type { Streamer } from "../../../modules/streamers/domain/Streamer.js";

export class InMemoryStreamerRepository
  extends EventEmitter
  implements StreamerRepository
{
  private readonly streamers = new Map<string, Streamer>();

  async getStreamers(): Promise<Streamer[]> {
    return await Promise.resolve([...this.streamers.values()]);
  }

  async getStreamer(id: string): Promise<Streamer | null> {
    return await Promise.resolve(this.streamers.get(id) ?? null);
  }

  async createStreamer(id: string): Promise<void> {
    this.streamers.set(id, {
      id,
      users: [],
    });

    await Promise.resolve(this.emit("streamerAdded", id));
  }

  async deleteStreamer(id: string): Promise<void> {
    this.streamers.delete(id);
    await Promise.resolve(this.emit("streamerDeleted", id));
  }

  // helpers
  seed(streamer: Streamer): void {
    this.streamers.set(streamer.id, streamer);
  }

  clear(): void {
    this.streamers.clear();
  }
}
