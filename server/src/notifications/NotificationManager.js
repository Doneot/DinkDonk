const { logger } = require("../utils/logger");

class NotificationManager {
  constructor(channels = []) {
    this.channels = channels;
  }

  async notify(user, notification) {
    return Promise.allSettled(
      this.channels.map(async (channel) => {
        try {
          return await channel.send(user, notification);
        } catch (error) {
          logger.error("Notification channel failed", {
            channel: channel.name,
            userId: user.id,
            notificationType: notification.type,
            message: error.message,
          });

          throw error;
        }
      }),
    );
  }
}

module.exports = { NotificationManager };
