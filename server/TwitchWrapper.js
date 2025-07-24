// server/TwitchWrapper.js
const axios = require("axios");
const EventEmitter = require("events");
const {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_WEBHOOK_SECRET,
  SERVER_URL,
} = require("./config");

class TwitchWrapper extends EventEmitter {
  constructor() {
    super();
    this.ready = false;
    this._headers = {
      "Client-ID": TWITCH_CLIENT_ID,
      "Content-Type": "application/json",
    };
    this._token = {};
    this.initTokenInterval().then(() => {
      this.emit("ready");
      this.ready = true;
    });
  }

  async initTokenInterval() {
    await this._getAccessToken();
    //  refresh token 5 minutes before it expires
    this._tokenRefreshTime = Date.now() + (this._token.expires_in - 300) * 1000;
    this._intervalId = setInterval(() => {
      if (Date.now() >= this._tokenRefreshTime) {
        clearInterval(this._intervalId);
        this._getAccessToken();
      }
    }, 60 * 1000);
  }

  async makeApiCall(endpoint, params = {}, headers = {}, method = "GET") {
    try {
      const url = `https://api.twitch.tv/helix/${endpoint}`;
      const res = await axios({
        method,
        url,
        headers: { ...this._headers, ...headers },
        data: method === "POST" ? params : undefined,
        params: method === "GET" || method === "DELETE" ? params : undefined,
      });
      return res.data.data;
    } catch (error) {
      if (error.code === "ENOTFOUND") {
        console.error("DNS resolution failed. Is the internet down? :", error);
      } else if (
        error.response?.status === 404 &&
        endpoint === "eventsub/subscriptions" &&
        method === "DELETE"
      ) {
        throw error;
      } else {
        console.error("Twitch API error:", error);
        throw error;
      }
    }
  }

  async _getAccessToken() {
    const params = {
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    };

    const res = await axios.post("https://id.twitch.tv/oauth2/token", params);
    this._token = {
      access_token: res.data.access_token,
      expires_in: res.data.expires_in,
    };
    this._headers.Authorization = `Bearer ${this._token.access_token}`;
    return this._token;
  }

  async fetchStreamers(streamerIds) {
    if (typeof streamerIds === "string") {
      return this.makeApiCall("users", { id: streamerIds });
    } else if (Array.isArray(streamerIds)) {
      const params = new URLSearchParams();
      for (const id of streamerIds) {
        params.append("id", id);
      }
      return this.makeApiCall("users", params);
    } else {
      throw new Error("fetchStreamers expects a string or an array of strings");
    }
  }

  async getStreamer(streamerName) {
    const res = await this.makeApiCall("users", {
      login: streamerName.toLowerCase(),
    });
    if (res.length === 0) {
      console.warn(`Streamer ${streamerName} not found.`);
      return null;
    }
    return res[0];
  }

  async searchStreamers(query) {
    return this.makeApiCall("search/channels", { query: query });
  }

  async getStream(streamerId) {
    return this.makeApiCall(
      "streams",
      { user_id: streamerId.toLowerCase() },
      { "Cache-Control": "no-cache" }
    );
  }

  async getSubscriptions() {
    return this.makeApiCall("eventsub/subscriptions");
  }

  async subscribeEvent(type, condition, version = 1) {
    const data = await this.makeApiCall(
      "eventsub/subscriptions",
      {
        type: type,
        version: version,
        condition: condition,
        transport: {
          method: "webhook",
          callback: `${SERVER_URL}/eventsub`,
          secret: TWITCH_WEBHOOK_SECRET,
        },
      },
      {},
      "POST"
    );
    console.log(`Subscribed from subscription ${data[0]["id"]}`);
    return data;
  }

  async unsubscribeEvent(subscriptionId) {
    try {
      await this.makeApiCall(
        "eventsub/subscriptions",
        { id: subscriptionId },
        {},
        "DELETE"
      );
      console.log(`Unsubscribed from subscription ${subscriptionId}`);
    } catch (error) {
      if (error.response?.status === 404) {
        console.warn(
          `Subscription ${subscriptionId} not found. Might already be deleted.`
        );
      } else {
        console.error(`Error unsubscribing ${subscriptionId} :`, error);
        throw error;
      }
    }
  }

  async unsubscribeAllEvents() {
    const subscriptions = await this.getSubscriptions();
    return Promise.all(
      subscriptions.map(
        async (subscription) => await this.unsubscribeEvent(subscription["id"])
      )
    );
  }
}

module.exports = { TwitchWrapper };
