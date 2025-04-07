require("dotenv").config();
const axios = require("axios");

class TwitchWrapper {
  constructor() {
    this._headers = {
      "Client-ID": process.env.CLIENT_ID,
      "Content-Type": "application/json",
    };
    this._tokens = {};
    this._activeSubscriptions = [];
  }

  get tokens() {
    return this._tokens;
  }

  /**
   * @param {Object} tokens object containing OAuth tokens : {access_token: x, refresh_token: y}
   */
  set tokens(tokens) {
    this._tokens = tokens;
  }

  /**
   * Get Oauth tokens corresponding the client_id and client_secret
   * @returns {Promise<Object>} Oauth tokens
   */
  getAccessToken = async () => {
    try {
      const res = await axios.post(
        `https://id.twitch.tv/oauth2/token?client_id=${process.env.CLIENT_ID}&client_secret=${process.env.CLIENT_SECRET}&grant_type=client_credentials`
      );
      this._tokens = {
        access_token: res.data.access_token,
        expires_in: res.data.expires_in,
      };
      return this._tokens;
    } catch (error) {
      if (error instanceof axios.AxiosError) {
        console.log(
          `Error ${error.response?.data?.status} : ${error.response?.data?.message}`
        );
      } else {
        console.log(error);
      }
      return null;
    }
  };

  /**
   * Get the streamer info
   * @param {String} login Login of a twitch user
   * @returns {Promise<Array<object>>} streamer info
   */
  getStreamer = async (login) => {
    return await this._errorHandler(this._getStreamer, [login]);
  };

  /**
   * Get the streamer info
   * @param {String} streamerId user id of broadcaster
   * @returns {Promise<Array<object>>} streams of streamer corresponding to user_id
   */
  getStream = async (streamerId) => {
    return await this._errorHandler(this._getStream, [streamerId]);
  };

  /**
   * Subscribes to events according the subscription type given
   * @param {String} token User access token
   * @param {String} sessionId id of the socket connection
   * @param {String} type identifies the event subscribed to
   * @param {Object} condition identifies the parameters under which the event fires
   * @param {number} version  identifies the definition of the subscription type to use
   */
  subscribeEvent = async (type, condition, version = 1) =>
    await this._errorHandler(this._subscribeEvent(type, condition, version));

  _errorHandler = async (asyncCallback, args) => {
    try {
      return await asyncCallback(args);
    } catch (error) {
      if (error instanceof axios.AxiosError) {
        if (error.response?.data?.status == 401) {
          const storedTokens = await this.getAccessToken();
          if (!storedTokens) {
            console.error("Can't refresh tokens");
            throw error;
          }
          this._tokens = storedTokens;
          return await asyncCallback();
        }
      }
    }
  };

  _getStreamer = async ([login]) => {
    this._headers.Authorization = `Bearer ${this._tokens.access_token}`;
    this._headers["Cache-Control"] = "no-cache";
    const res = await axios.get(
      `https://api.twitch.tv/helix/users?login=${login.toLowerCase()}`,
      { headers: this._headers }
    );
    return res.data.data;
  };

  _getStream = async ([streamerId]) => {
    this._headers.Authorization = `Bearer ${this._tokens.access_token}`;
    this._headers["Cache-Control"] = "no-cache";
    const res = await axios.get(
      `https://api.twitch.tv/helix/streams?user_id=${streamerId.toLowerCase()}`,
      { headers: this._headers }
    );
    return res.data.data;
  };

  _subscribeEvent = async (type, condition, version) => {
    this._headers.Authorization = `Bearer ${this._tokens.access_token}`;
    this._headers["Client-Id"] = process.env.CLIENT_ID;
    this._headers["Content-Type"] = "application/json";
    try {
      let res = await axios.post(
        "https://api.twitch.tv/helix/eventsub/subscriptions",
        {
          type: type,
          version: version,
          condition: condition,
          transport: {
            method: "webhook",
            callback: `${process.env.WEBHOOK_URL}/eventsub`,
            secret: process.env.CLIENT_SECRET,
          },
        },
        { headers: this._headers }
      );
      console.log(`Subscribed from subscription ${res.data.data[0]["id"]}`);
      this._activeSubscriptions.push(res.data.data[0]["id"]);
    } catch (error) {
      if (error instanceof axios.AxiosError) {
        console.log(
          `Error ${error.response?.data?.status} : ${error.response?.data?.message}`
        );
      } else {
        console.log(error);
      }
    }
  };

  // Function to unsubscribe from a specific subscription
  unsubscribeEvent = async (subscriptionId) => {
    try {
      const res = await axios.delete(
        `https://api.twitch.tv/helix/eventsub/subscriptions?id=${subscriptionId}`,
        {
          headers: {
            Authorization: `Bearer ${this._tokens.access_token}`,
            "Client-Id": process.env.CLIENT_ID,
          },
        }
      );
      console.log(`Unsubscribed from subscription ${subscriptionId}`);
      this._activeSubscriptions = this._activeSubscriptions.filter(
        (id) => id !== subscriptionId
      );
      return res.data;
    } catch (error) {
      if (error instanceof axios.AxiosError) {
        console.log(
          `Error ${error.response?.data?.status} : ${error.response?.data?.message}`
        );
      } else {
        console.log(error);
      }
    }
  };

  // Function to unsubscribe from all subscriptions
  unsubscribeAllEvents = async () => {
    // Unsubscribe from each active subscription
    for (const subscriptionId of this._activeSubscriptions) {
      await this.unsubscribeEvent(subscriptionId);
    }
  };
}

module.exports = { TwitchWrapper };
