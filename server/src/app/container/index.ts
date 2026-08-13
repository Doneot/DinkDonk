import { createRedisClient } from "../../infrastructure/redis/redisClient.js";
import type { Redis } from "../../infrastructure/redis/redisClient.js";
import type { DiscordBot } from "../../modules/discord/infrastructure/DiscordBot.js";
import type { EventSubSyncService } from "../../modules/notifications/application/EventSubSyncService.js";
import type { NotificationManager } from "../../modules/notifications/application/NotificationManager.js";
import type { StreamNotificationService } from "../../modules/notifications/application/StreamNotificationService.js";
import type { SubscriptionCleanupService } from "../../modules/notifications/application/SubscriptionCleanupService.js";
import type { StreamerLiveStateService, SocketNotifier } from "../../modules/streamers/application/StreamerLiveStateService.js";
import type { TwitchProvider } from "../../modules/twitch/application/TwitchProvider.js";
import { createFirestore } from "../../shared/config/firebase.js";
import type { Runtime } from "../runtime/Runtime.js";
import { createNotificationManager } from "./notifications.js";
import { createProviders } from "./providers.js";
import { createRepositories, type Repositories } from "./repositories.js";
import { createServices } from "./services.js";

export interface Container {
  firestore: FirebaseFirestore.Firestore;
  redis: Redis | undefined;
  twitch: TwitchProvider;
  discord: DiscordBot;

  repositories: Repositories;

  services: {
    eventSubSync: EventSubSyncService;
    streamNotification: StreamNotificationService;
    subscriptionCleanup: SubscriptionCleanupService;
    streamerLiveState: StreamerLiveStateService;
  };

  notificationManager: NotificationManager;

  /**
   * The container is built before the HTTP/Socket.IO server exists (see
   * server.ts), so StreamerLiveStateService is constructed with a no-op
   * notifier below. server.ts calls this once `sockets` exists, pointing it
   * at the real implementation - the same ordering problem server.ts's own
   * `disconnectUser` indirection already solves, applied here too.
   */
  bindSocketNotifier(notify: SocketNotifier): void;
}

export function createContainer(runtime: Runtime): Container {
  const firestore = createFirestore();

  const redis = createRedisClient();

  const repositories = createRepositories(firestore);

  const { twitch, discord } = createProviders(repositories, runtime);

  const notificationManager = createNotificationManager(discord, repositories);

  let notifySocketUser: SocketNotifier = () => {};

  const services = createServices(
    twitch,
    repositories,
    notificationManager,
    (userId, event, payload) => notifySocketUser(userId, event, payload),
  );

  return {
    firestore,
    redis,
    twitch,
    discord,
    repositories,
    services,
    notificationManager,

    bindSocketNotifier(notify) {
      notifySocketUser = notify;
    },
  };
}
