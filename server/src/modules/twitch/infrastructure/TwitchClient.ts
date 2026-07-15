import axios from "axios";
import type { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";

import { env } from "../../../shared/config/env.js";
import { logger } from "../../../shared/logger/logger.js";
import { assertDefined } from "../../../shared/utils/assert.js";
import { normalizeTwitchLogin } from "../../../shared/utils/validators.js";

import { mapTwitchStreamer } from "./mappers/mapTwitchStreamer.js";

import type {
  TwitchEventSubSubscription,
  TwitchStreamer,
} from "../domain/Twitch.js";

export type TwitchRequestOptions = {
  method?: AxiosRequestConfig["method"];

  params?: Record<string, unknown> | URLSearchParams;

  data?: unknown;

  retries?: number;

  headers?: Record<string, string>;
};

export type TwitchClientOptions = {
  publicUrl: string;

  http?: AxiosInstance;

  clientId?: string;

  accessToken?: string;
};

type TwitchStream = {
  id: string;

  user_id: string;

  user_name: string;

  title: string;

  viewer_count: number;
};

export class TwitchClient {
  private readonly http: AxiosInstance;

  private readonly clientId: string;

  readonly callbackUrl: string;

  private accessToken?: string;

  constructor({
    publicUrl,
    http = axios.create(),
    clientId = assertDefined(
      env.twitch.clientId,
      "Twitch Client ID is not defined",
    ),
    accessToken,
  }: TwitchClientOptions) {
    this.http = http;

    this.clientId = clientId;

    this.callbackUrl = `${publicUrl}/eventsub`;

    if (accessToken) {
      this.accessToken = accessToken;
    }
  }

  setAccessToken(accessToken: string): void {
    this.accessToken = accessToken;
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
            "Client-ID": this.clientId,

            ...(this.accessToken
              ? {
                  Authorization: `Bearer ${this.accessToken}`,
                }
              : {}),

            "Content-Type": "application/json",

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
          logger.error(
            {
              endpoint,

              method,

              status: err.response?.status,

              message: err.message,
            },
            "Twitch API request failed",
          );

          return [];
        }

        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }

    return [];
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

  async searchStreamers(query: string | string[]): Promise<TwitchStreamer[]> {
    const result = await this.request<TwitchStreamer>("search/channels", {
      params: {
        query,
      },
    });

    return result.map(mapTwitchStreamer);
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

          callback: this.callbackUrl,

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
}
