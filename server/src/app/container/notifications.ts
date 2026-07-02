import { NotificationManager } from "../../modules/notifications/application/NotificationManager.js";

import { DiscordNotificationChannel } from "../../modules/notifications/infrastructure/channels/DiscordNotificationChannel.js";
import { WebPushNotificationChannel } from "../../modules/notifications/infrastructure/channels/WebPushNotificationChannel.js";

import { env } from "../../shared/config/env.js";
import { assertDefined } from "../../shared/utils/assert.js";

import type { DiscordBot } from "../../modules/discord/infrastructure/DiscordBot.js";
import type { Repositories } from "./repositories.js";

export function createNotificationManager(
  discord: DiscordBot,
  repositories: Repositories,
) {
  const channels = [
    new DiscordNotificationChannel({
      discord,
      userRepository: repositories.users,
    }),

    new WebPushNotificationChannel({
      pushSubscriptionRepository: repositories.pushSubscriptions,
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

  return new NotificationManager(channels);
}
