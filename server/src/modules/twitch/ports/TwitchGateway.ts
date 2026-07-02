import type { TwitchStreamer } from "../domain/Twitch.js";
import type { TwitchEventSubSubscription } from "../domain/Twitch.js";

export interface TwitchStreamerProvider {
  getStreamer(login: string): Promise<TwitchStreamer | null>;

  fetchStreamers(streamerIds: string | string[]): Promise<TwitchStreamer[]>;

  searchStreamers(query: string): Promise<TwitchStreamer[]>;
}

export interface TwitchSubscriptionProvider {
  getEventSubSubscriptions(): Promise<TwitchEventSubSubscription[]>;

  subscribeToEvent(
    type: string,
    condition: Record<string, string>,
    version?: string,
  ): Promise<TwitchEventSubSubscription[]>;

  unsubscribeFromEvent(
    subscriptionId: string,
  ): Promise<TwitchEventSubSubscription[]>;
}
