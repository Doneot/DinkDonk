import webpush from "web-push";
import { logger } from "../../utils/logger.js";
import type { User } from "../../types/user.js";
import type {
  Notification,
  NotificationResult,
} from "../../types/notifications.js";
import type { PushSubscriptionRecord } from "../../types/pushSubscription.js";

type Repository = {
  listPushSubscriptions(userId: string): Promise<PushSubscriptionRecord[]>;

  markPushSubscriptionSeen(
    userId: string,
    subscriptionId: string,
  ): Promise<void>;

  deletePushSubscription(
    userId: string,
    subscriptionId: string,
  ): Promise<unknown>;
};

type VapidConfig = {
  publicKey: string;

  privateKey: string;

  subject: string;
};

type WebPushNotificationChannelOptions = {
  repository: Repository;

  vapid?: VapidConfig;
};

type WebPushError = Error & {
  statusCode?: number;
};

export class WebPushNotificationChannel {
  readonly name = "webPush";

  private readonly repository: Repository;

  private readonly enabled: boolean;

  constructor({ repository, vapid }: WebPushNotificationChannelOptions) {
    this.repository = repository;

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

    const subscriptions = await this.repository.listPushSubscriptions(user.id);

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

          await this.repository.markPushSubscriptionSeen(
            user.id,
            subscription.id,
          );

          return {
            sent: true,
          };
        } catch (error: unknown) {
          const err = error as WebPushError;

          if (err.statusCode === 404 || err.statusCode === 410) {
            await this.repository.deletePushSubscription(
              user.id,
              subscription.id,
            );

            return {
              sent: false,

              expired: true,
            };
          }

          logger.error("Web Push notification failed", {
            userId: user.id,

            subscriptionId: subscription.id,

            statusCode: err.statusCode,

            message: err.message,
          });

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
