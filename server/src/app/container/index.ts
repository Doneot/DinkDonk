import { createFirestore } from "../../shared/config/firebase.js";

import { createRepositories, type Repositories } from "./repositories.js";
import { createProviders } from "./providers.js";
import { createNotificationManager } from "./notifications.js";
import { createServices } from "./services.js";

import type { TwitchProvider } from "../../modules/twitch/application/TwitchProvider.js";
import type { DiscordBot } from "../../modules/discord/infrastructure/DiscordBot.js";
import type { NotificationManager } from "../../modules/notifications/application/NotificationManager.js";
import type { EventSubSyncService } from "../../modules/notifications/application/EventSubSyncService.js";
import type { StreamNotificationService } from "../../modules/notifications/application/StreamNotificationService.js";
import type { SubscriptionCleanupService } from "../../modules/notifications/application/SubscriptionCleanupService.js";

export interface Container {
  firestore: FirebaseFirestore.Firestore;
  twitch: TwitchProvider;
  discord: DiscordBot;

  repositories: Repositories;

  services: {
    eventSubSync: EventSubSyncService;
    streamNotification: StreamNotificationService;
    subscriptionCleanup: SubscriptionCleanupService;
  };

  notificationManager: NotificationManager;
}

export function createContainer(): Container {
  const firestore = createFirestore();

  const repositories = createRepositories(firestore);

  const { twitch, discord } = createProviders(repositories);

  const notificationManager = createNotificationManager(discord, repositories);

  const services = createServices(twitch, repositories, notificationManager);

  return {
    firestore,
    twitch,
    discord,
    repositories,
    services,
    notificationManager,
  };
}
