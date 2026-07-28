import type { Streamer } from "../domain/Streamer.js";

export interface StreamerRepository {
  on(event: string, listener: (streamerId: string) => Promise<void>): unknown;
  getStreamers(): Promise<Streamer[]>;
  getStreamer(id: string): Promise<Streamer | null>;
  createStreamer(id: string): Promise<void>;
  deleteStreamer(id: string): Promise<void>;
}
