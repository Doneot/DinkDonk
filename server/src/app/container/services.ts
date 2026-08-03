import { EventSubSyncService } from "../../modules/notifications/application/EventSubSyncService.js";
import { StreamNotificationService } from "../../modules/notifications/application/StreamNotificationService.js";
import { SubscriptionCleanupService } from "../../modules/notifications/application/SubscriptionCleanupService.js";

import type { NotificationManager } from "../../modules/notifications/application/NotificationManager.js";
import type { TwitchProvider } from "../../modules/twitch/application/TwitchProvider.js";

import type { Repositories } from "./repositories.js";

export function createServices(
  twitch: TwitchProvider,
  repositories: Repositories,
  notificationManager: NotificationManager,
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
  };
}
