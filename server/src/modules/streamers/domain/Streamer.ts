export interface Streamer {
  id: string;

  isLive: boolean;

  /** ISO timestamp of the current broadcast's start; null when not live. */
  liveSince: string | null;
}
