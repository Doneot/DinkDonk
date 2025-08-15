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
    this.init();
  }

  async init() {
    await this._getAccessToken();
    this.ready = true;
    this.emit("ready");
    this._startTokenRefreshLoop();
  }

  _startTokenRefreshLoop() {
    if (this._intervalId) clearInterval(this._intervalId);

    const intervalTime = 60 * 1000; // check every 60 seconds
    this._intervalId = setInterval(async () => {
      if (Date.now() >= this._tokenRefreshTime) {
        try {
          await this._getAccessToken();
          console.log("🔄 Token refreshed — checking subscriptions...");
          this.emit("tokenRefreshed");
        } catch (err) {
          console.error("Failed to refresh token or resubscribe:", err.message);
        }
      }
    }, intervalTime);
  }

  /**
   * Robust API call with retries on network/DNS failures
   */
  async makeApiCall(
    endpoint,
    params = {},
    headers = {},
    method = "GET",
    retries = 3,
    delay = 500
  ) {
    const url = `https://api.twitch.tv/helix/${endpoint}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await axios({
          method,
          url,
          headers: { ...this._headers, ...headers },
          data: method === "POST" ? params : undefined,
          params: method === "GET" || method === "DELETE" ? params : undefined,
        });
        return res.data.data || [];
      } catch (error) {
        if (
          error.code === "ENOTFOUND" ||
          error.code === "ECONNRESET" ||
          error.code === "ECONNREFUSED"
        ) {
          console.error(
            `Network/DNS error on attempt ${attempt}:`,
            error.message
          );
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, delay * attempt)); // exponential backoff
            continue;
          } else {
            console.error("All retries failed. Returning empty array.");
            return []; // safely return empty array
          }
        } else if (
          error.response?.status === 404 &&
          endpoint === "eventsub/subscriptions" &&
          method === "DELETE"
        ) {
          return []; // safe fallback for delete subscription
        } else {
          console.error("Twitch API error:", error.message);
          return []; // fallback to empty array for safety
        }
      }
    }
  }

  async _getAccessToken() {
    const params = {
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    };

    try {
      const res = await axios.post("https://id.twitch.tv/oauth2/token", params);
      this._token = {
        access_token: res.data.access_token,
        expires_in: res.data.expires_in,
      };
      this._headers.Authorization = `Bearer ${this._token.access_token}`;
      this._tokenRefreshTime =
        Date.now() + (this._token.expires_in - 300) * 1000;
      return this._token;
    } catch (err) {
      console.error("Failed to get access token:", err.message);
      return {};
    }
  }

  async fetchStreamers(streamerIds) {
    try {
      if (typeof streamerIds === "string") {
        return await this.makeApiCall("users", { id: streamerIds });
      } else if (Array.isArray(streamerIds)) {
        const params = new URLSearchParams();
        for (const id of streamerIds) params.append("id", id);
        return await this.makeApiCall("users", params);
      } else {
        throw new Error(
          "fetchStreamers expects a string or an array of strings"
        );
      }
    } catch (err) {
      console.error("Failed to fetch streamers:", err.message);
      return []; // safe fallback
    }
  }

  async getStreamer(streamerName) {
    try {
      const res = await this.makeApiCall("users", {
        login: streamerName.toLowerCase(),
      });
      if (!res || res.length === 0) return null;
      return res[0];
    } catch (err) {
      console.error("Failed to get streamer:", err.message);
      return null;
    }
  }

  async searchStreamers(query) {
    try {
      return await this.makeApiCall("search/channels", { query });
    } catch (err) {
      console.error("Failed to search streamers:", err.message);
      return [];
    }
  }

  async getStream(streamerId) {
    try {
      return await this.makeApiCall(
        "streams",
        { user_id: streamerId.toLowerCase() },
        { "Cache-Control": "no-cache" }
      );
    } catch (err) {
      console.error("Failed to get stream:", err.message);
      return [];
    }
  }

  async getSubscriptions() {
    try {
      return await this.makeApiCall("eventsub/subscriptions");
    } catch (err) {
      console.error("Failed to get subscriptions:", err.message);
      return [];
    }
  }

  async subscribeEvent(type, condition, version = 1) {
    try {
      const data = await this.makeApiCall(
        "eventsub/subscriptions",
        {
          type,
          version,
          condition,
          transport: {
            method: "webhook",
            callback: `${SERVER_URL}/eventsub`,
            secret: TWITCH_WEBHOOK_SECRET,
          },
        },
        {},
        "POST"
      );
      if (data.length > 0) console.log(`Subscribed to event ${data[0]["id"]}`);
      return data;
    } catch (err) {
      console.error("Failed to subscribe event:", err.message);
      return [];
    }
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
    } catch (err) {
      if (err.response?.status === 404) {
        console.warn(`Subscription ${subscriptionId} not found.`);
      } else {
        console.error(`Error unsubscribing ${subscriptionId}:`, err.message);
      }
    }
  }

  async unsubscribeAllEvents() {
    try {
      const subscriptions = (await this.getSubscriptions()).filter((sub) =>
        sub.transport?.callback?.includes(SERVER_URL)
      );
      return Promise.all(
        subscriptions.map((sub) => this.unsubscribeEvent(sub.id))
      );
    } catch (err) {
      console.error("Failed to unsubscribe all events:", err.message);
      return [];
    }
  }
}

module.exports = { TwitchWrapper };
