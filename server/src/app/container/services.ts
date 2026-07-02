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
  return {
    eventSubSync: new EventSubSyncService(
      twitch.client,
      repositories.streamers,
    ),

    streamNotification: new StreamNotificationService(
      twitch.client,
      repositories.users,
      repositories.streamers,
      repositories.subscriptions,
      notificationManager,
    ),

    subscriptionCleanup: new SubscriptionCleanupService(
      twitch.client,
      repositories.streamers,
    ),
  };
}
