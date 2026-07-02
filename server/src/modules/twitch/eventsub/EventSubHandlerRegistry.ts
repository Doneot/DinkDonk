import type { TwitchEventSubStreamOnlineEvent } from "../domain/Twitch.js";

export type StreamOnlineHandler = (
  event: TwitchEventSubStreamOnlineEvent,
) => Promise<void>;

export type EventSubHandlerRegistry = Record<string, StreamOnlineHandler>;

export function createEventSubHandlerRegistry(
  onNotification: (
    type: string,
    event: TwitchEventSubStreamOnlineEvent,
  ) => Promise<void>,
): EventSubHandlerRegistry {
  return {
    "stream.online": (event) => onNotification("stream.online", event),
  };
}
