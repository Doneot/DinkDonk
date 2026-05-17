const { logger } = require('../../utils/logger');

class DiscordNotificationChannel {
  constructor({ discord, repository }) {
    this.name = 'discord';
    this.discord = discord;
    this.repository = repository;
  }

  async send(user, notification) {
    if (!user?.canReceiveDM) return { sent: false, skipped: true, reason: 'dm_disabled' };

    try {
      await this.discord.notifyUser(user.id, `${notification.body}\n${notification.url}`);
      return { sent: true };
    } catch (error) {
      if (error.code === 50007) {
        await this.repository.saveUser(user.id, { canReceiveDM: false });
        return { sent: false, expired: true, reason: 'discord_dm_blocked' };
      }
      logger.error('Discord notification failed', { userId: user.id, message: error.message });
      return { sent: false, reason: error.message };
    }
  }
}

module.exports = { DiscordNotificationChannel };
