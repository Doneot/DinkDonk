import type { TwitchStreamer, TwitchEventSubSubscription } from "../twitch.js";

export interface TwitchStreamerService {
  getStreamer(username: string): Promise<TwitchStreamer | null>;

  getStreamer(login: string): Promise<TwitchStreamer | null>;

  fetchStreamers(streamerIds: string | string[]): Promise<TwitchStreamer[]>;

  searchStreamers(query: string): Promise<TwitchStreamer[]>;
}

export interface TwitchSubscriptionService {
  getSubscriptions(): Promise<TwitchEventSubSubscription[]>;

  subscribeToEvent(
    type: string,
    condition: Record<string, string>,
    version?: string,
  ): Promise<TwitchEventSubSubscription[]>;

  unsubscribeFromEvent(
    subscriptionId: string,
  ): Promise<TwitchEventSubSubscription[]>;
}
