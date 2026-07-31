import { createFirestore } from "../../shared/config/firebase.js";
import { createRedisClient } from "../../infrastructure/redis/redisClient.js";

import { createRepositories, type Repositories } from "./repositories.js";
import { createProviders } from "./providers.js";
import { createNotificationManager } from "./notifications.js";
import { createServices } from "./services.js";

import type { Redis } from "../../infrastructure/redis/redisClient.js";
import type { TwitchProvider } from "../../modules/twitch/application/TwitchProvider.js";
import type { DiscordBot } from "../../modules/discord/infrastructure/DiscordBot.js";
import type { NotificationManager } from "../../modules/notifications/application/NotificationManager.js";
import type { EventSubSyncService } from "../../modules/notifications/application/EventSubSyncService.js";
import type { StreamNotificationService } from "../../modules/notifications/application/StreamNotificationService.js";
import type { SubscriptionCleanupService } from "../../modules/notifications/application/SubscriptionCleanupService.js";
import type { Runtime } from "../runtime/Runtime.js";

export interface Container {
  firestore: FirebaseFirestore.Firestore;
  redis: Redis;
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

export function createContainer(runtime: Runtime): Container {
  const firestore = createFirestore();

  const redis = createRedisClient();

  const repositories = createRepositories(firestore);

  const { twitch, discord } = createProviders(repositories, runtime);

  const notificationManager = createNotificationManager(discord, repositories);

  const services = createServices(twitch, repositories, notificationManager);

  return {
    firestore,
    redis,
    twitch,
    discord,
    repositories,
    services,
    notificationManager,
  };
}
