import type { Streamer } from "../domain/Streamer.js";

export interface StreamerRepository {
  on(arg0: string, arg1: (streamerId: string) => Promise<void>): unknown;
  getStreamers(): Promise<Streamer[]>;
  getStreamer(id: string): Promise<Streamer | null>;
  createStreamer(id: string): Promise<void>;
  deleteStreamer(id: string): Promise<void>;
}
