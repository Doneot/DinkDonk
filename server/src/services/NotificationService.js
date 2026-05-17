const { logger } = require('../utils/logger');

class NotificationService {
  constructor({ twitch, repository, discord }) {
    this.twitch = twitch;
    this.repository = repository;
    this.discord = discord;
    this.gcRunning = false;
  }

  async syncEventSubSubscriptions() {
    const [streamers, subscriptions] = await Promise.all([
      this.repository.listStreamers(),
      this.getStreamOnlineSubscriptions(),
    ]);

    for (const streamer of streamers) {
      const streamerId = streamer.streamer_id || streamer.id;
      const exists = subscriptions.some((sub) => sub.condition?.broadcaster_user_id === streamerId);
      if (!exists) {
        logger.info(`Creating Twitch EventSub subscription for ${streamerId}`);
        await this.twitch.subscribeToEvent('stream.online', { broadcaster_user_id: streamerId });
      }
    }
  }

  async getStreamOnlineSubscriptions() {
    const subscriptions = await this.twitch.getEventSubSubscriptions();
    return subscriptions.filter((subscription) => subscription.type === 'stream.online');
  }

  async handleStreamerAdded(streamerId) {
    const subscriptions = await this.getStreamOnlineSubscriptions();
    const exists = subscriptions.some((sub) => sub.condition?.broadcaster_user_id === streamerId);
    if (exists) return;
    await this.twitch.subscribeToEvent('stream.online', { broadcaster_user_id: streamerId });
  }

  async handleStreamOnline(event) {
    const streamer = await this.twitch.getStreamerByLogin(event.broadcaster_user_login);
    if (!streamer) return;

    const streamerDocument = await this.repository.getStreamer(streamer.id);
    const userIds = streamerDocument?.users || [];
    for (const userId of userIds) {
      const user = await this.repository.getUser(userId);
      if (!user?.canReceiveDM) continue;
      const message = await this.repository.getNotificationMessage(userId, streamer.id);
      await this.discord.notifyStreamerLive(userId, streamer, message);
    }
  }

  async garbageCollectSubscriptions() {
    if (this.gcRunning) return;
    this.gcRunning = true;
    try {
      const subscriptions = await this.getStreamOnlineSubscriptions();
      for (const subscription of subscriptions) {
        const streamerId = subscription.condition?.broadcaster_user_id;
        if (!streamerId) continue;
        const streamer = await this.repository.getStreamer(streamerId);
        if (!streamer || (streamer.users || []).length === 0) {
          await this.garbageCollectStreamer(streamerId);
        }
      }
    } finally {
      this.gcRunning = false;
    }
  }

  async garbageCollectStreamer(streamerId) {
    const streamer = await this.repository.getStreamer(streamerId);
    if ((streamer?.users || []).length > 0) return;

    const subscriptions = await this.getStreamOnlineSubscriptions();
    const matching = subscriptions.filter((sub) => sub.condition?.broadcaster_user_id === streamerId);
    await Promise.all(matching.map((sub) => this.twitch.unsubscribeFromEvent(sub.id)));
    await this.repository.deleteStreamer(streamerId);
  }
}

module.exports = { NotificationService };
