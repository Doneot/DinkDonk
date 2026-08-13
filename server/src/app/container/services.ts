import { EventSubSyncService } from "../../modules/notifications/application/EventSubSyncService.js";
import type { NotificationManager } from "../../modules/notifications/application/NotificationManager.js";
import { StreamNotificationService } from "../../modules/notifications/application/StreamNotificationService.js";
import { SubscriptionCleanupService } from "../../modules/notifications/application/SubscriptionCleanupService.js";
import { StreamerLiveStateService } from "../../modules/streamers/application/StreamerLiveStateService.js";
import type { SocketNotifier } from "../../modules/streamers/application/StreamerLiveStateService.js";
import type { TwitchProvider } from "../../modules/twitch/application/TwitchProvider.js";
import type { Repositories } from "./repositories.js";

export function createServices(
  twitch: TwitchProvider,
  repositories: Repositories,
  notificationManager: NotificationManager,
  notifySocketUser: SocketNotifier,
) {
  const eventSubSync = new EventSubSyncService(
    twitch.client,
    repositories.streamers,
  );

  return {
    eventSubSync,

    streamNotification: new StreamNotificationService(
      twitch.client,
      repositories.users,
      repositories.streamers,
      notificationManager,
    ),

    // Shares eventSubSync's lock/exists-check for the recreate case - see
    // SubscriptionCleanupService's constructor comment.
    subscriptionCleanup: new SubscriptionCleanupService(
      twitch.client,
      repositories.streamers,
      eventSubSync,
    ),

    streamerLiveState: new StreamerLiveStateService(
      repositories.streamers,
      notifySocketUser,
    ),
  };
}
