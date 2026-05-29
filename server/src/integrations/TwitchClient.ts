import axios from "axios";
import { EventEmitter } from "node:events";
import type { AxiosInstance, AxiosRequestConfig, AxiosError } from "axios";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { normalizeTwitchLogin } from "../utils/validators.js";
import { assertDefined } from "../utils/assert.js";
import type {
  TwitchEventSubSubscription,
  TwitchStreamer,
} from "../types/twitch.js";

type TwitchRequestOptions = {
  method?: AxiosRequestConfig["method"];

  params?: Record<string, unknown> | URLSearchParams;

  data?: unknown;

  retries?: number;

  headers?: Record<string, string>;
};

type TwitchClientOptions = {
  http?: AxiosInstance;

  refreshSkewSeconds?: number;
};

type TwitchStream = {
  id: string;

  user_id: string;

  user_name: string;

  title: string;

  viewer_count: number;
};

export class TwitchClient extends EventEmitter {
  private readonly http: AxiosInstance;

  private readonly refreshSkewSeconds: number;

  private readonly headers: Record<string, string>;

  private refreshInterval?: NodeJS.Timeout;

  private tokenRefreshAt = 0;

  constructor({
    http = axios.create(),
    refreshSkewSeconds = 300,
  }: TwitchClientOptions = {}) {
    super();

    this.http = http;

    this.refreshSkewSeconds = refreshSkewSeconds;

    this.headers = {
      "Client-ID": assertDefined(
        env.twitch.clientId,
        "Twitch Client ID is not defined",
      ),

      "Content-Type": "application/json",
    };
  }

  async start(): Promise<void> {
    await this.refreshAccessToken();

    this.emit("ready");

    this.startTokenRefreshLoop();
  }

  async stop({
    unsubscribeEventSub = false,
  }: {
    unsubscribeEventSub?: boolean;
  } = {}): Promise<void> {
    clearInterval(this.refreshInterval);

    if (unsubscribeEventSub) {
      await this.unsubscribeWebhookSubscriptions();
    }
  }

  startTokenRefreshLoop(): void {
    clearInterval(this.refreshInterval);

    this.refreshInterval = setInterval(async () => {
      if (Date.now() < this.tokenRefreshAt) {
        return;
      }

      try {
        await this.refreshAccessToken();

        this.emit("tokenRefreshed");
      } catch (error) {
        const err = error as Error;

        logger.error("Failed to refresh Twitch token", {
          message: err.message,
        });
      }
    }, 60_000);
  }

  async request<T>(
    endpoint: string,
    {
      method = "GET",
      params,
      data,
      retries = 3,
      headers,
    }: TwitchRequestOptions = {},
  ): Promise<T[]> {
    const url = `https://api.twitch.tv/helix/${endpoint}`;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const response = await this.http.request<{
          data?: T[];
        }>({
          method,

          url,

          headers: {
            ...this.headers,
            ...headers,
          },

          params,

          data,
        });

        return response.data?.data || [];
      } catch (error) {
        const err = error as AxiosError;

        const retryable = ["ENOTFOUND", "ECONNRESET", "ECONNREFUSED"].includes(
          err.code || "",
        );

        const notFoundDelete =
          err.response?.status === 404 && method === "DELETE";

        if (notFoundDelete) {
          return [];
        }

        if (!retryable || attempt === retries) {
          logger.error("Twitch API request failed", {
            endpoint,

            method,

            status: err.response?.status,

            message: err.message,
          });

          return [];
        }

        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }

    return [];
  }

  async refreshAccessToken(): Promise<void> {
    const response = await this.http.post<{
      access_token: string;

      expires_in: number;
    }>("https://id.twitch.tv/oauth2/token", {
      client_id: env.twitch.clientId,

      client_secret: env.twitch.clientSecret,

      grant_type: "client_credentials",
    });

    const {
      access_token: accessToken,

      expires_in: expiresIn,
    } = response.data;

    this.headers.Authorization = `Bearer ${accessToken}`;

    this.tokenRefreshAt =
      Date.now() + (expiresIn - this.refreshSkewSeconds) * 1000;

    logger.info("Twitch token refreshed");
  }

  async fetchStreamers(ids: string | string[]): Promise<TwitchStreamer[]> {
    if (Array.isArray(ids)) {
      const params = new URLSearchParams();

      ids.forEach((id) => {
        params.append("id", id);
      });

      return this.request<TwitchStreamer>("users", {
        params,
      });
    }

    return this.request<TwitchStreamer>("users", {
      params: {
        id: ids,
      },
    });
  }

  async getStreamer(login: string): Promise<TwitchStreamer | null> {
    const data = await this.request<TwitchStreamer>("users", {
      params: {
        login: normalizeTwitchLogin(login),
      },
    });

    return data[0] || null;
  }

  subscribeEvent(
    type: string,
    condition: Record<string, string>,
    version = "1",
  ): Promise<TwitchEventSubSubscription[]> {
    return this.subscribeToEvent(type, condition, version);
  }

  unsubscribeEvent(
    subscriptionId: string,
  ): Promise<TwitchEventSubSubscription[]> {
    return this.unsubscribeFromEvent(subscriptionId);
  }

  getSubscriptions(): Promise<TwitchEventSubSubscription[]> {
    return this.getEventSubSubscriptions();
  }

  searchStreamers(query: string | string[]): Promise<TwitchStreamer[]> {
    return this.request<TwitchStreamer>("search/channels", {
      params: {
        query,
      },
    });
  }

  getStream(streamerId: string): Promise<TwitchStream[]> {
    return this.request<TwitchStream>("streams", {
      params: {
        user_id: streamerId,
      },

      headers: {
        "Cache-Control": "no-cache",
      },
    });
  }

  getEventSubSubscriptions(): Promise<TwitchEventSubSubscription[]> {
    return this.request<TwitchEventSubSubscription>("eventsub/subscriptions");
  }

  subscribeToEvent(
    type: string,
    condition: Record<string, string>,
    version = "1",
  ): Promise<TwitchEventSubSubscription[]> {
    return this.request<TwitchEventSubSubscription>("eventsub/subscriptions", {
      method: "POST",

      data: {
        type,

        version,

        condition,

        transport: {
          method: "webhook",

          callback: `${env.serverUrl}/eventsub`,

          secret: env.twitch.webhookSecret,
        },
      },
    });
  }

  unsubscribeFromEvent(
    subscriptionId: string,
  ): Promise<TwitchEventSubSubscription[]> {
    return this.request<TwitchEventSubSubscription>("eventsub/subscriptions", {
      method: "DELETE",

      params: {
        id: subscriptionId,
      },
    });
  }

  async unsubscribeWebhookSubscriptions(): Promise<void> {
    const subscriptions = await this.getEventSubSubscriptions();

    const matchingSubscriptions = subscriptions.filter(
      (subscription) =>
        subscription.transport?.callback === `${env.serverUrl}/eventsub`,
    );

    await Promise.all(
      matchingSubscriptions.map((subscription) =>
        this.unsubscribeFromEvent(subscription.id),
      ),
    );

    logger.info(
      `Removed ${matchingSubscriptions.length} EventSub subscriptions for this callback`,
    );
  }
}
