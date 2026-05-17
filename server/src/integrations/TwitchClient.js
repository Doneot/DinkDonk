const axios = require('axios');
const EventEmitter = require('events');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { normalizeTwitchLogin } = require('../utils/validators');

class TwitchClient extends EventEmitter {
  constructor({ http = axios.create(), refreshSkewSeconds = 300 } = {}) {
    super();
    this.http = http;
    this.refreshSkewSeconds = refreshSkewSeconds;
    this.ready = false;
    this.headers = {
      'Client-ID': env.twitch.clientId,
      'Content-Type': 'application/json',
    };
  }

  async start() {
    await this.refreshAccessToken();
    this.ready = true;
    this.emit('ready');
    this.startTokenRefreshLoop();
  }

  async stop({ unsubscribeEventSub = false } = {}) {
    clearInterval(this.refreshInterval);
    if (unsubscribeEventSub) {
      await this.unsubscribeWebhookSubscriptions();
    }
  }

  startTokenRefreshLoop() {
    clearInterval(this.refreshInterval);
    this.refreshInterval = setInterval(async () => {
      if (Date.now() < this.tokenRefreshAt) return;
      try {
        await this.refreshAccessToken();
        this.emit('tokenRefreshed');
      } catch (error) {
        logger.error('Failed to refresh Twitch token', { message: error.message });
      }
    }, 60_000);
  }

  async request(endpoint, { method = 'GET', params, data, retries = 3 } = {}) {
    const url = `https://api.twitch.tv/helix/${endpoint}`;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const response = await this.http.request({ method, url, headers: this.headers, params, data });
        return response.data?.data || [];
      } catch (error) {
        const retryable = ['ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED'].includes(error.code);
        const notFoundDelete = error.response?.status === 404 && method === 'DELETE';
        if (notFoundDelete) return [];
        if (!retryable || attempt === retries) {
          logger.error('Twitch API request failed', { endpoint, method, status: error.response?.status, message: error.message });
          return [];
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }

    return [];
  }

  async refreshAccessToken() {
    const response = await this.http.post('https://id.twitch.tv/oauth2/token', {
      client_id: env.twitch.clientId,
      client_secret: env.twitch.clientSecret,
      grant_type: 'client_credentials',
    });

    const { access_token: accessToken, expires_in: expiresIn } = response.data;
    this.headers.Authorization = `Bearer ${accessToken}`;
    this.tokenRefreshAt = Date.now() + (expiresIn - this.refreshSkewSeconds) * 1000;
    logger.info('Twitch token refreshed');
  }

  fetchStreamers(ids) {
    if (Array.isArray(ids)) {
      const params = new URLSearchParams();
      ids.forEach((id) => params.append('id', id));
      return this.request('users', { params });
    }
    return this.request('users', { params: { id: ids } });
  }

  async getStreamerByLogin(login) {
    const data = await this.request('users', { params: { login: normalizeTwitchLogin(login) } });
    return data[0] || null;
  }

  getStreamer(login) {
    return this.getStreamerByLogin(login);
  }

  subscribeEvent(type, condition, version = '1') {
    return this.subscribeToEvent(type, condition, version);
  }

  unsubscribeEvent(subscriptionId) {
    return this.unsubscribeFromEvent(subscriptionId);
  }

  getSubscriptions() {
    return this.getEventSubSubscriptions();
  }

  searchStreamers(query) {
    return this.request('search/channels', { params: { query } });
  }

  getStream(streamerId) {
    return this.request('streams', { params: { user_id: streamerId }, headers: { 'Cache-Control': 'no-cache' } });
  }

  getEventSubSubscriptions() {
    return this.request('eventsub/subscriptions');
  }

  subscribeToEvent(type, condition, version = '1') {
    return this.request('eventsub/subscriptions', {
      method: 'POST',
      data: {
        type,
        version,
        condition,
        transport: {
          method: 'webhook',
          callback: `${env.serverUrl}/eventsub`,
          secret: env.twitch.webhookSecret,
        },
      },
    });
  }

  unsubscribeFromEvent(subscriptionId) {
    return this.request('eventsub/subscriptions', { method: 'DELETE', params: { id: subscriptionId } });
  }

  async unsubscribeWebhookSubscriptions() {
    const subscriptions = await this.getEventSubSubscriptions();
    const matchingSubscriptions = subscriptions.filter((subscription) => (
      subscription.transport?.callback === `${env.serverUrl}/eventsub`
    ));

    await Promise.all(matchingSubscriptions.map((subscription) => this.unsubscribeFromEvent(subscription.id)));
    logger.info(`Removed ${matchingSubscriptions.length} EventSub subscriptions for this callback`);
  }
}

module.exports = { TwitchClient };
