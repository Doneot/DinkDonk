import type { TwitchStreamer, TwitchLiveStream, TwitchEventSubSubscription } from "../domain/Twitch.js";

export interface TwitchStreamerProvider {
  getStreamer(login: string): Promise<TwitchStreamer | null>;

  fetchStreamers(streamerIds: string | string[]): Promise<TwitchStreamer[]>;

  searchStreamers(query: string): Promise<TwitchStreamer[]>;

  /**
   * Ground truth for "is this streamer live right now", for the subset of
   * `userIds` that currently are - absent ids are offline. Exists
   * specifically for the case EventSub can't cover: a streamer who was
   * already live before this app ever subscribed to their events (e.g. a
   * brand new streamer's first subscriber), so no stream.online webhook
   * will ever fire for their already-in-progress broadcast.
   */
  getLiveStreams(userIds: string[]): Promise<TwitchLiveStream[]>;
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
