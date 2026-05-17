const webpush = require('web-push');
const { logger } = require('../../utils/logger');

class WebPushNotificationChannel {
  constructor({ repository, vapid }) {
    this.name = 'webPush';
    this.repository = repository;
    this.enabled = Boolean(vapid?.publicKey && vapid?.privateKey && vapid?.subject);

    if (this.enabled) {
      webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    }
  }

  async send(user, notification) {
    if (!this.enabled) return { sent: false, skipped: true, reason: 'web_push_not_configured' };

    const subscriptions = await this.repository.listPushSubscriptions(user.id);
    if (subscriptions.length === 0) return { sent: false, skipped: true, reason: 'no_push_subscriptions' };

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      url: notification.url,
      icon: '/DinkDonk.png',
      badge: '/DinkDonk.png',
      data: {
        type: notification.type,
        url: notification.url,
        streamerId: notification.streamer?.id,
      },
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(subscription.subscription, payload, { TTL: 60 * 60 });
          await this.repository.markPushSubscriptionSeen(user.id, subscription.id);
          return { sent: true };
        } catch (error) {
          if (error.statusCode === 404 || error.statusCode === 410) {
            await this.repository.deletePushSubscription(user.id, subscription.id);
            return { sent: false, expired: true };
          }
          logger.error('Web Push notification failed', {
            userId: user.id,
            subscriptionId: subscription.id,
            statusCode: error.statusCode,
            message: error.message,
          });
          return { sent: false, reason: error.message };
        }
      }),
    );

    return {
      sent: results.some((result) => result.status === 'fulfilled' && result.value.sent),
      results,
    };
  }
}

module.exports = { WebPushNotificationChannel };
