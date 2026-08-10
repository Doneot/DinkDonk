import type {
  TwitchEventSubStreamOfflineEvent,
  TwitchEventSubStreamOnlineEvent,
} from "../domain/Twitch.js";

export type TwitchEventSubEvent =
  | TwitchEventSubStreamOnlineEvent
  | TwitchEventSubStreamOfflineEvent;

export type EventSubNotificationHandler = (
  event: TwitchEventSubEvent,
) => Promise<void>;

export type EventSubHandlerRegistry = Record<string, EventSubNotificationHandler>;

export function createEventSubHandlerRegistry(
  onNotification: (type: string, event: TwitchEventSubEvent) => Promise<void>,
): EventSubHandlerRegistry {
  return {
    "stream.online": (event) => onNotification("stream.online", event),
    "stream.offline": (event) => onNotification("stream.offline", event),
  };
}
