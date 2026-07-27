import type {
  TwitchEventSubSubscription,
  TwitchStreamer,
} from "../../modules/twitch/domain/Twitch.js";
import type {
  TwitchStreamerProvider,
  TwitchSubscriptionProvider,
} from "../../modules/twitch/ports/TwitchGateway.js";

export const TEST_CALLBACK_URL = "http://localhost:3000/eventsub";

export function buildEventSubSubscription(
  overrides: Partial<TwitchEventSubSubscription> = {},
): TwitchEventSubSubscription {
  return {
    id: "sub-1",
    type: "stream.online",
    status: "enabled",
    transport: { method: "webhook", callback: TEST_CALLBACK_URL },
    condition: { broadcaster_user_id: "streamer-1" },
    ...overrides,
  };
}

/**
 * Stateful stand-in for the Twitch EventSub API so tests can assert on the
 * subscriptions that actually exist rather than on call sequences.
 */
export class FakeTwitchSubscriptions implements TwitchSubscriptionProvider {
  private nextId = 1;

  constructor(public subscriptions: TwitchEventSubSubscription[] = []) {}

  getEventSubSubscriptions(): Promise<TwitchEventSubSubscription[]> {
    return Promise.resolve([...this.subscriptions]);
  }

  subscribeToEvent(
    type: string,
    condition: Record<string, string>,
    version = "1",
  ): Promise<TwitchEventSubSubscription[]> {
    this.nextId += 1;

    const created = buildEventSubSubscription({
      id: `sub-${this.nextId}`,
      type,
      condition: condition as TwitchEventSubSubscription["condition"],
    });

    this.subscriptions.push(created);

    void version;

    return Promise.resolve([created]);
  }

  unsubscribeFromEvent(
    subscriptionId: string,
  ): Promise<TwitchEventSubSubscription[]> {
    const removed = this.subscriptions.filter(
      (subscription) => subscription.id === subscriptionId,
    );

    this.subscriptions = this.subscriptions.filter(
      (subscription) => subscription.id !== subscriptionId,
    );

    return Promise.resolve(removed);
  }

  broadcasterIds(): string[] {
    return this.subscriptions.map(
      (subscription) => subscription.condition.broadcaster_user_id,
    );
  }
}

export class FakeTwitchStreamers implements TwitchStreamerProvider {
  constructor(private readonly streamers: TwitchStreamer[] = []) {}

  getStreamer(login: string): Promise<TwitchStreamer | null> {
    return Promise.resolve(
      this.streamers.find((streamer) => streamer.login === login) ?? null,
    );
  }

  fetchStreamers(streamerIds: string | string[]): Promise<TwitchStreamer[]> {
    const ids = Array.isArray(streamerIds) ? streamerIds : [streamerIds];

    return Promise.resolve(
      this.streamers.filter((streamer) => ids.includes(streamer.id)),
    );
  }

  searchStreamers(query: string): Promise<TwitchStreamer[]> {
    return Promise.resolve(
      this.streamers.filter((streamer) => streamer.login.includes(query)),
    );
  }
}
