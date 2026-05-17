const http = require("node:http");
const path = require("node:path");
const { env, assertRequiredEnv } = require("./config/env");
const { createFirestore } = require("./config/firebase");
const { logger } = require("./utils/logger");
const { FirestoreRepository } = require("./stores/FirestoreRepository");
const { TwitchClient } = require("./integrations/TwitchClient");
const { DiscordBot } = require("./bot/DiscordBot");
const { NotificationManager } = require("./notifications/NotificationManager");
const { NotificationService } = require("./notifications/NotificationService");
const {
  DiscordNotificationChannel,
} = require("./notifications/channels/DiscordNotificationChannel");
const {
  WebPushNotificationChannel,
} = require("./notifications/channels/WebPushNotificationChannel");
const { createApp } = require("./http/createApp");
const { createSocketServer } = require("./realtime/socketServer");

async function bootstrap() {
  assertRequiredEnv();

  const httpServer = http.createServer();
  const sockets = createSocketServer(httpServer);
  const firestore = createFirestore();
  const repository = new FirestoreRepository(firestore, {
    onUserChanged: (userId, user) =>
      sockets.notifyUser(userId, "user_data_updated", user),
  });
  const twitch = new TwitchClient();
  const context = { twitch, firestore: repository };
  const discord = new DiscordBot({
    token: env.discord.token,
    commandDirectory: path.join(__dirname, "../commands"),
    context,
    onDmCapabilityChanged: (userId, canReceiveDM) =>
      repository.saveUser(userId, { canReceiveDM }),
  });
  context.discord = discord;

  const notificationChannels = [
    new DiscordNotificationChannel({ discord, repository }),
    new WebPushNotificationChannel({ repository, vapid: env.webPush }),
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
  const shutdown = async (signal) => {
    if (shuttingDown) return;
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
      logger.error("Graceful shutdown failed", {
        message: error.message,
        stack: error.stack,
      });
      process.exit(1);
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((error) => {
  logger.error("Application failed to start", {
    message: error.message,
    stack: error.stack,
  });
  process.exit(1);
});
