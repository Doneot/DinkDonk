import { NotificationManager } from "../../modules/notifications/application/NotificationManager.js";

import { DiscordNotificationChannel } from "../../modules/notifications/infrastructure/channels/DiscordNotificationChannel.js";
import { WebPushNotificationChannel } from "../../modules/notifications/infrastructure/channels/WebPushNotificationChannel.js";

import { env } from "../../shared/config/env.js";

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

    // WEB_PUSH_PUBLIC_KEY/PRIVATE_KEY/SUBJECT are all required, non-optional
    // env vars (see envSchema.ts), so env.webPush's fields are guaranteed to
    // be defined once EnvSchema.parse() has succeeded - no runtime
    // assertion needed here.
    new WebPushNotificationChannel({
      pushSubscriptionRepository: repositories.pushSubscriptions,
      vapid: {
        publicKey: env.webPush.publicKey,
        privateKey: env.webPush.privateKey,
        subject: env.webPush.subject,
      },
    }),
  ];

  return new NotificationManager(channels);
}
