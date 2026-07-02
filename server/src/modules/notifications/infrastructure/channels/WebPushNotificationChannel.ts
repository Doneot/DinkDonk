import webpush from "web-push";
import { logger } from "../../../../shared/logger/logger.js";
import type { User } from "../../../users/domain/User.js";
import type {
  Notification,
  NotificationResult,
} from "../../domain/Notification.js";
import type { PushSubscriptionRepository } from "../../ports/PushSubscriptionRepository.js";

type VapidConfig = {
  publicKey: string;

  privateKey: string;

  subject: string;
};

type WebPushNotificationChannelOptions = {
  pushSubscriptionRepository: PushSubscriptionRepository;

  vapid?: VapidConfig;
};

type WebPushError = Error & {
  statusCode?: number;
};

export class WebPushNotificationChannel {
  readonly name = "webPush";

  private readonly pushSubscriptionRepository: PushSubscriptionRepository;

  private readonly enabled: boolean;

  constructor({
    pushSubscriptionRepository,
    vapid,
  }: WebPushNotificationChannelOptions) {
    this.pushSubscriptionRepository = pushSubscriptionRepository;

    this.enabled = Boolean(
      vapid?.publicKey && vapid?.privateKey && vapid?.subject,
    );

    if (this.enabled && vapid) {
      webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    }
  }

  async send(
    user: User,
    notification: Notification,
  ): Promise<{
    sent: boolean;

    results?: PromiseSettledResult<NotificationResult>[];

    skipped?: boolean;

    reason?: string;
  }> {
    if (!this.enabled) {
      return {
        sent: false,

        skipped: true,

        reason: "web_push_not_configured",
      };
    }

    const subscriptions =
      await this.pushSubscriptionRepository.getPushSubscriptions(user.id);

    if (subscriptions.length === 0) {
      return {
        sent: false,

        skipped: true,

        reason: "no_push_subscriptions",
      };
    }

    const payload = JSON.stringify({
      title: notification.title,

      body: notification.body,

      url: notification.url,

      icon: "/DinkDonk.png",

      badge: "/DinkDonk.png",

      data: {
        type: notification.type,

        url: notification.url,

        streamerId: notification.streamer?.id,
      },
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (subscription): Promise<NotificationResult> => {
        try {
          await webpush.sendNotification(
            subscription.subscription,

            payload,

            {
              TTL: 60 * 60,
            },
          );

          await this.pushSubscriptionRepository.markPushSubscriptionSeen(
            user.id,
            subscription.id,
          );

          return {
            sent: true,
          };
        } catch (error: unknown) {
          const err = error as WebPushError;

          if (err.statusCode === 404 || err.statusCode === 410) {
            await this.pushSubscriptionRepository.deletePushSubscription(
              user.id,
              subscription.id,
            );

            return {
              sent: false,

              expired: true,
            };
          }

          logger.error(
            {
              userId: user.id,

              subscriptionId: subscription.id,

              statusCode: err.statusCode,

              message: err.message,
            },
            "Web Push notification failed",
          );

          return {
            sent: false,

            reason: err.message || "unknown_error",
          };
        }
      }),
    );

    return {
      sent: results.some(
        (result): result is PromiseFulfilledResult<NotificationResult> =>
          result.status === "fulfilled" && result.value.sent,
      ),

      results,
    };
  }
}
