import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { env, assertRequiredEnv } from "./config/env.js";
import { createFirestore } from "./config/firebase.js";
import { logger } from "./utils/logger.js";

import { FirestoreRepository } from "./repositories/FirestoreRepository.js";

import { TwitchClient } from "./integrations/TwitchClient.js";

import { DiscordBot } from "./bot/DiscordBot.js";

import { NotificationManager } from "./notifications/NotificationManager.js";
import { NotificationService } from "./notifications/NotificationService.js";

import { DiscordNotificationChannel } from "./notifications/channels/DiscordNotificationChannel.js";

import { WebPushNotificationChannel } from "./notifications/channels/WebPushNotificationChannel.js";

import { createApp } from "./http/createApp.js";
import { createSocketServer } from "./realtime/socketServer.js";

import { assertDefined } from "./utils/assert.js";

import type { User } from "./types/user.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap(): Promise<void> {
  assertRequiredEnv();

  const httpServer = http.createServer();

  const sockets = createSocketServer(httpServer);

  const firestore = createFirestore();

  const repository = new FirestoreRepository(firestore, {
    onUserChanged: async (userId: string, user: User): Promise<void> => {
      return sockets.notifyUser(userId, "user_data_updated", user);
    },
  });

  const twitch = new TwitchClient();

  const context: {
    twitch: TwitchClient;
    firestore: FirestoreRepository;
    discord?: DiscordBot;
  } = {
    twitch,
    firestore: repository,
  };

  const discord = new DiscordBot({
    token: assertDefined(env.discord.token, "Discord token"),

    commandDirectory: path.join(__dirname, "../commands"),

    context,

    onDmCapabilityChanged: (
      userId: string,
      canReceiveDM: boolean,
    ): Promise<void> => repository.saveUser(userId, { canReceiveDM }),
  });

  context.discord = discord;

  const notificationChannels = [
    new DiscordNotificationChannel({
      discord,
      repository,
    }),

    new WebPushNotificationChannel({
      repository,
      vapid: {
        publicKey: assertDefined(
          env.webPush?.publicKey,
          "Web Push VAPID public key",
        ),
        privateKey: assertDefined(
          env.webPush?.privateKey,
          "Web Push VAPID private key",
        ),
        subject: assertDefined(env.webPush?.subject, "Web Push VAPID subject"),
      },
    }),
  ];

  const notificationManager = new NotificationManager(notificationChannels);

  const notificationService = new NotificationService({
    twitch,
    repository,
    notificationManager,
  });

  const app = createApp({
    firestore,
    repository,
    twitch,
    discord,
    notificationService,
  });

  httpServer.on("request", app);

  repository.on("streamerAdded", (streamerId) =>
    notificationService.handleStreamerAdded(streamerId),
  );

  repository.on("streamerEmpty", (streamerId) =>
    notificationService.garbageCollectStreamer(streamerId),
  );

  twitch.on("ready", () =>
    notificationService
      .syncEventSubSubscriptions()
      .then(() => notificationService.garbageCollectSubscriptions()),
  );

  twitch.on("tokenRefreshed", () =>
    notificationService.syncEventSubSubscriptions(),
  );

  await Promise.all([twitch.start(), discord.start()]);

  httpServer.listen(env.port, "0.0.0.0", () => {
    logger.info(`HTTP and Socket.IO server listening on ${env.port}`);
  });

  const garbageCollector = setInterval(
    () => notificationService.garbageCollectSubscriptions(),
    env.eventSubGarbageCollectionIntervalMs,
  );

  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    logger.info(`Received ${signal}; shutting down gracefully`);

    clearInterval(garbageCollector);

    httpServer.close();

    try {
      await sockets.close();

      await discord.stop();

      await twitch.stop({
        unsubscribeEventSub: env.unsubscribeEventSubOnShutdown,
      });

      logger.info("Shutdown complete");

      process.exit(0);
    } catch (error) {
      const err = error as Error;

      logger.error("Graceful shutdown failed", {
        message: err.message,
        stack: err.stack,
      });

      process.exit(1);
    }
  };

  process.on("SIGINT", shutdown);

  process.on("SIGTERM", shutdown);
}

bootstrap().catch((error: unknown) => {
  const err = error instanceof Error ? error : new Error(String(error));

  logger.error("Application failed to start", {
    message: err.message,
    stack: err.stack,
  });

  process.exit(1);
});
