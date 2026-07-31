import axios from "axios";
import type { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";

import { env } from "../../../shared/config/env.js";
import { logger } from "../../../shared/logger/logger.js";
import { assertDefined } from "../../../shared/utils/assert.js";
import { normalizeTwitchLogin } from "./normalizeTwitchLogin.js";

import { mapTwitchStreamer } from "./mappers/mapTwitchStreamer.js";

import type {
  TwitchEventSubSubscription,
  TwitchStreamer,
} from "../domain/Twitch.js";
import type {
  TwitchStreamerProvider,
  TwitchSubscriptionProvider,
} from "../ports/TwitchGateway.js";

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

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Thrown when a request exhausts its retries or fails non-retryably, so
 * callers can tell "Twitch genuinely has no data for this" (an empty array)
 * apart from "the request failed" - which previously looked identical,
 * letting an API outage masquerade as e.g. "no such streamer" or "no active
 * EventSub subscriptions" (the latter risked a cleanup sweep treating a
 * transient outage as every streamer being subscriber-less).
 */
export class TwitchApiError extends Error {
  constructor(
    message: string,
    readonly endpoint: string,
    readonly method: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TwitchApiError";
  }
}

type TwitchStream = {
  id: string;

  user_id: string;

  user_name: string;

  title: string;

  viewer_count: number;
};

export class TwitchClient
  implements TwitchStreamerProvider, TwitchSubscriptionProvider
{
  private readonly http: AxiosInstance;

  private readonly clientId: string;

  readonly callbackUrl: string;

  private accessToken?: string;

  constructor({
    publicUrl,
    http = axios.create({ timeout: REQUEST_TIMEOUT_MS }),
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

  /** Whether an app access token has been obtained at least once. */
  get isReady(): boolean {
    return Boolean(this.accessToken);
  }

  /**
   * Performs a single Helix request (with retry/backoff), returning both the
   * page's data and Twitch's pagination cursor (if any) so callers that need
   * every page - not just the first up-to-100 items - can keep requesting.
   */
  private async requestPage<T>(
    endpoint: string,
    {
      method = "GET",
      params,
      data,
      retries = 3,
      headers,
    }: TwitchRequestOptions = {},
  ): Promise<{ data: T[]; cursor: string | undefined }> {
    const url = `https://api.twitch.tv/helix/${endpoint}`;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const response = await this.http.request<{
          data?: T[];
          pagination?: { cursor?: string };
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

        return {
          data: response.data?.data || [],
          cursor: response.data?.pagination?.cursor,
        };
      } catch (error) {
        const err = error as AxiosError;

        const status = err.response?.status;

        const retryableNetworkError = [
          "ENOTFOUND",
          "ECONNRESET",
          "ECONNREFUSED",
          "ECONNABORTED",
          "ETIMEDOUT",
        ].includes(err.code || "");

        // Rate limited or a transient server-side failure: both are worth
        // retrying, unlike a 4xx client error (bad request, unauthorized).
        const retryableStatus = status === 429 || (status ?? 0) >= 500;

        const retryable = retryableNetworkError || retryableStatus;

        const notFoundDelete = status === 404 && method === "DELETE";

        if (notFoundDelete) {
          return { data: [], cursor: undefined };
        }

        if (!retryable || attempt === retries) {
          logger.error(
            {
              endpoint,

              method,

              status,

              message: err.message,
            },
            "Twitch API request failed",
          );

          throw new TwitchApiError(err.message, endpoint, method, status);
        }

        const retryAfterSeconds = Number(err.response?.headers?.["retry-after"]);

        const delayMs = Number.isFinite(retryAfterSeconds)
          ? retryAfterSeconds * 1000
          : 500 * attempt;

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return { data: [], cursor: undefined };
  }

  /**
   * Follows Twitch's pagination.cursor across every page of a GET list
   * endpoint, accumulating results - Helix caps list responses at 100 items
   * per page (e.g. eventsub/subscriptions), so a single request() call
   * silently truncated anything past the first page. Only meaningful for GET
   * requests; POST/DELETE calls return at most one item and never carry a
   * cursor worth following.
   */
  async request<T>(
    endpoint: string,
    options: TwitchRequestOptions = {},
  ): Promise<T[]> {
    const { method = "GET", params } = options;

    const results: T[] = [];

    let after: string | undefined;

    do {
      const pageParams =
        after === undefined
          ? params
          : params instanceof URLSearchParams
            ? new URLSearchParams([...params.entries(), ["after", after]])
            : { ...params, after };

      const page = await this.requestPage<T>(endpoint, {
        ...options,
        ...(pageParams === undefined ? {} : { params: pageParams }),
      });

      results.push(...page.data);

      after = method === "GET" ? page.cursor : undefined;
    } while (after);

    return results;
  }

  // Twitch's users endpoint hard-caps at 100 ids per request (a 400, not a
  // truncation) - anything beyond that must be split into multiple calls.
  private static readonly MAX_USER_IDS_PER_REQUEST = 100;

  async fetchStreamers(ids: string | string[]): Promise<TwitchStreamer[]> {
    if (Array.isArray(ids)) {
      const results: TwitchStreamer[] = [];

      for (
        let i = 0;
        i < ids.length;
        i += TwitchClient.MAX_USER_IDS_PER_REQUEST
      ) {
        const chunk = ids.slice(i, i + TwitchClient.MAX_USER_IDS_PER_REQUEST);

        const params = new URLSearchParams();

        chunk.forEach((id) => {
          params.append("id", id);
        });

        results.push(
          ...(await this.request<TwitchStreamer>("users", { params })),
        );
      }

      return results;
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
