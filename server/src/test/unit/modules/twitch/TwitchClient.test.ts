import type { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TwitchApiError,
  TwitchClient,
} from "../../../../modules/twitch/infrastructure/TwitchClient.js";
import { logger } from "../../../../shared/logger/logger.js";
import { anyString } from "../../../helpers/matchers.js";

type HttpResponse = {
  data: { data?: unknown[]; pagination?: { cursor?: string } };
};

function createHttpMock() {
  const request = vi
    .fn<(config: AxiosRequestConfig) => Promise<HttpResponse>>()
    .mockResolvedValue({ data: { data: [] } });

  return {
    http: { request } as unknown as AxiosInstance,
    request,
  };
}

function createClient(overrides: { accessToken?: string } = {}) {
  const { http, request } = createHttpMock();

  const client = new TwitchClient({
    publicUrl: "http://localhost:3000",
    http,
    ...overrides,
  });

  return { client, request };
}

function networkError(code: string): AxiosError {
  return Object.assign(new Error(code), { code }) as AxiosError;
}

function httpError(
  status: number,
  headers?: Record<string, string>,
): AxiosError {
  return Object.assign(new Error(`Request failed with status ${status}`), {
    response: { status, headers },
  }) as AxiosError;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TwitchClient", () => {
  it("exposes the EventSub callback url derived from the public url", () => {
    const { client } = createClient();

    expect(client.callbackUrl).toBe("http://localhost:3000/eventsub");
  });

  describe("request", () => {
    it("returns the data array from a successful response", async () => {
      const { client, request } = createClient();

      request.mockResolvedValue({ data: { data: [{ id: "streamer-1" }] } });

      await expect(client.getEventSubSubscriptions()).resolves.toEqual([
        { id: "streamer-1" },
      ]);
    });

    it("returns an empty array when the response carries no data", async () => {
      const { client, request } = createClient();

      request.mockResolvedValue({ data: {} });

      await expect(client.getEventSubSubscriptions()).resolves.toEqual([]);
    });

    it("follows Twitch's pagination cursor across every page of a GET list endpoint", async () => {
      const { client, request } = createClient();

      request
        .mockResolvedValueOnce({
          data: {
            data: [{ id: "sub-1" }],
            pagination: { cursor: "cursor-1" },
          },
        })
        .mockResolvedValueOnce({
          data: {
            data: [{ id: "sub-2" }],
            pagination: { cursor: "cursor-2" },
          },
        })
        .mockResolvedValueOnce({
          data: { data: [{ id: "sub-3" }], pagination: {} },
        });

      await expect(client.getEventSubSubscriptions()).resolves.toEqual([
        { id: "sub-1" },
        { id: "sub-2" },
        { id: "sub-3" },
      ]);

      expect(request).toHaveBeenCalledTimes(3);

      // getEventSubSubscriptions() calls request() with no params of its
      // own, so the "after" cursor is carried as a plain object rather than
      // a URLSearchParams instance here.
      expect(request.mock.calls[1]?.[0]?.params).toMatchObject({
        after: "cursor-1",
      });
      expect(request.mock.calls[2]?.[0]?.params).toMatchObject({
        after: "cursor-2",
      });
    });

    it("does not follow a pagination cursor for a non-GET request", async () => {
      const { client, request } = createClient();

      request.mockResolvedValue({
        data: {
          data: [{ id: "sub-1" }],
          pagination: { cursor: "should-be-ignored" },
        },
      });

      await client.subscribeToEvent("stream.online", {
        broadcaster_user_id: "streamer-1",
      });

      expect(request).toHaveBeenCalledTimes(1);
    });

    it("omits the Authorization header until an access token is set", async () => {
      const { client, request } = createClient();

      await client.getEventSubSubscriptions();

      expect(request.mock.calls[0]?.[0]?.headers).toMatchObject({
        "Client-ID": anyString,
        "Content-Type": "application/json",
      });
      expect(request.mock.calls[0]?.[0]?.headers).not.toHaveProperty(
        "Authorization",
      );
    });

    it("sends the access token supplied at construction", async () => {
      const { client, request } = createClient({ accessToken: "initial" });

      await client.getEventSubSubscriptions();

      expect(request.mock.calls[0]?.[0]?.headers).toMatchObject({
        Authorization: "Bearer initial",
      });
    });

    it("sends the most recently set access token", async () => {
      const { client, request } = createClient();

      client.setAccessToken("rotated");

      await client.getEventSubSubscriptions();

      expect(request.mock.calls[0]?.[0]?.headers).toMatchObject({
        Authorization: "Bearer rotated",
      });
    });

    it.each(["ENOTFOUND", "ECONNRESET", "ECONNREFUSED"])(
      "retries after a %s failure and returns the eventual data",
      async (code) => {
        vi.useFakeTimers();

        const { client, request } = createClient();

        request
          .mockRejectedValueOnce(networkError(code))
          .mockResolvedValue({ data: { data: [{ id: "streamer-1" }] } });

        const pending = client.getEventSubSubscriptions();

        await vi.advanceTimersByTimeAsync(500);

        await expect(pending).resolves.toEqual([{ id: "streamer-1" }]);
        expect(request).toHaveBeenCalledTimes(2);
      },
    );

    it("gives up after exhausting the retry budget", async () => {
      vi.useFakeTimers();

      const error = vi.spyOn(logger, "error").mockReturnValue();
      const { client, request } = createClient();

      request.mockRejectedValue(networkError("ECONNRESET"));

      const pending = client.getEventSubSubscriptions();
      // Attach a handler immediately so the eventual rejection (after the
      // fake-timer advance below) isn't reported as unhandled.
      const assertion = expect(pending).rejects.toThrow(TwitchApiError);

      await vi.advanceTimersByTimeAsync(1_500);

      await assertion;
      expect(request).toHaveBeenCalledTimes(3);
      expect(error).toHaveBeenCalledOnce();
    });

    it("does not retry a non-retryable client error, and surfaces it instead of an empty result", async () => {
      const error = vi.spyOn(logger, "error").mockReturnValue();
      const { client, request } = createClient();

      request.mockRejectedValue(httpError(400));

      await expect(client.getEventSubSubscriptions()).rejects.toThrow(
        TwitchApiError,
      );
      expect(request).toHaveBeenCalledOnce();
      expect(error.mock.calls[0]?.[0]).toMatchObject({
        endpoint: "eventsub/subscriptions",
        method: "GET",
        status: 400,
      });
    });

    it("retries after a 5xx server error and returns the eventual data", async () => {
      vi.useFakeTimers();

      const { client, request } = createClient();

      request
        .mockRejectedValueOnce(httpError(503))
        .mockResolvedValue({ data: { data: [{ id: "streamer-1" }] } });

      const pending = client.getEventSubSubscriptions();

      await vi.advanceTimersByTimeAsync(500);

      await expect(pending).resolves.toEqual([{ id: "streamer-1" }]);
      expect(request).toHaveBeenCalledTimes(2);
    });

    it("retries a 429 after the delay given in the Retry-After header", async () => {
      vi.useFakeTimers();

      const { client, request } = createClient();

      const rateLimited = httpError(429, { "retry-after": "2" });

      request
        .mockRejectedValueOnce(rateLimited)
        .mockResolvedValue({ data: { data: [{ id: "streamer-1" }] } });

      const pending = client.getEventSubSubscriptions();

      // Not yet elapsed: still only the first attempt.
      await vi.advanceTimersByTimeAsync(1_000);
      expect(request).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_000);

      await expect(pending).resolves.toEqual([{ id: "streamer-1" }]);
      expect(request).toHaveBeenCalledTimes(2);
    });

    it("retries a 429 after the delay given in the Ratelimit-Reset header, preferring it over Retry-After", async () => {
      vi.useFakeTimers();

      const { client, request } = createClient();

      // Twitch's actual rate-limit signal, a Unix epoch-seconds reset time -
      // unlike the standard Retry-After header, which Twitch doesn't send.
      const resetEpochSeconds = Math.floor((Date.now() + 3_000) / 1000);
      const rateLimited = httpError(429, {
        "ratelimit-reset": String(resetEpochSeconds),
        // Present too, to prove Ratelimit-Reset wins when both are set.
        "retry-after": "1",
      });

      request
        .mockRejectedValueOnce(rateLimited)
        .mockResolvedValue({ data: { data: [{ id: "streamer-1" }] } });

      const pending = client.getEventSubSubscriptions();

      // Not yet elapsed if Ratelimit-Reset (~3s) is being honored rather
      // than Retry-After (1s).
      await vi.advanceTimersByTimeAsync(1_500);
      expect(request).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(2_000);

      await expect(pending).resolves.toEqual([{ id: "streamer-1" }]);
      expect(request).toHaveBeenCalledTimes(2);
    });

    it("treats a 404 on DELETE as an already-removed subscription", async () => {
      const error = vi.spyOn(logger, "error").mockReturnValue();
      const { client, request } = createClient();

      request.mockRejectedValue(httpError(404));

      await expect(client.unsubscribeFromEvent("sub-1")).resolves.toEqual([]);
      expect(error).not.toHaveBeenCalled();
    });

    it("still logs and surfaces a 404 on a non-DELETE request", async () => {
      const error = vi.spyOn(logger, "error").mockReturnValue();
      const { client, request } = createClient();

      request.mockRejectedValue(httpError(404));

      await expect(client.getEventSubSubscriptions()).rejects.toThrow(
        TwitchApiError,
      );
      expect(error).toHaveBeenCalledOnce();
    });
  });

  describe("fetchStreamers", () => {
    it("requests streamer records by batching id query params", async () => {
      const { client, request } = createClient();

      await client.fetchStreamers(["streamer-1", "streamer-2"]);

      const config = request.mock.calls[0]?.[0];
      const params = config?.params as URLSearchParams | undefined;

      expect(config?.url).toBe("https://api.twitch.tv/helix/users");
      expect(params?.getAll("id")).toEqual(["streamer-1", "streamer-2"]);
    });

    it("requests a single streamer by id", async () => {
      const { client, request } = createClient();

      await client.fetchStreamers("streamer-1");

      expect(request.mock.calls[0]?.[0]?.params).toEqual({ id: "streamer-1" });
    });

    it("splits more than 100 ids into multiple requests and merges the results", async () => {
      const { client, request } = createClient();

      const ids = Array.from({ length: 150 }, (_, i) => `streamer-${i}`);

      request
        .mockResolvedValueOnce({
          data: { data: ids.slice(0, 100).map((id) => ({ id })) },
        })
        .mockResolvedValueOnce({
          data: { data: ids.slice(100).map((id) => ({ id })) },
        });

      const streamers = await client.fetchStreamers(ids);

      expect(request).toHaveBeenCalledTimes(2);
      expect(streamers).toHaveLength(150);

      const firstBatch = request.mock.calls[0]?.[0]
        ?.params as URLSearchParams;
      const secondBatch = request.mock.calls[1]?.[0]
        ?.params as URLSearchParams;

      expect(firstBatch.getAll("id")).toHaveLength(100);
      expect(secondBatch.getAll("id")).toHaveLength(50);
    });
  });

  describe("getStreamer", () => {
    it("normalizes the login before querying", async () => {
      const { client, request } = createClient();

      await client.getStreamer("  StreamerName  ");

      expect(request.mock.calls[0]?.[0]?.params).toEqual({
        login: "streamername",
      });
    });

    it("returns the first match", async () => {
      const { client, request } = createClient();

      request.mockResolvedValue({
        data: { data: [{ id: "streamer-1" }, { id: "streamer-2" }] },
      });

      await expect(client.getStreamer("streamer")).resolves.toEqual({
        id: "streamer-1",
      });
    });

    it("returns null when Twitch knows no such login", async () => {
      const { client } = createClient();

      await expect(client.getStreamer("ghost")).resolves.toBeNull();
    });
  });

  describe("searchStreamers", () => {
    it("maps raw search results onto the streamer shape", async () => {
      const { client, request } = createClient();

      request.mockResolvedValue({
        data: {
          data: [
            {
              id: "streamer-1",
              login: "streamer",
              display_name: "Streamer",
              thumbnail_url: "https://example.com/thumb.png",
            },
          ],
        },
      });

      await expect(client.searchStreamers("streamer")).resolves.toEqual([
        {
          id: "streamer-1",
          login: "streamer",
          display_name: "Streamer",
          profile_image_url: "https://example.com/thumb.png",
        },
      ]);
      expect(request.mock.calls[0]?.[0]?.url).toBe(
        "https://api.twitch.tv/helix/search/channels",
      );
    });

    it("requests a single bounded page rather than following pagination", async () => {
      const { client, request } = createClient();

      request.mockResolvedValue({
        data: {
          data: [{ id: "streamer-1" }],
          // A cursor would tell request() to fetch another page - proves
          // searchStreamers deliberately doesn't follow it.
          pagination: { cursor: "next-page-cursor" },
        },
      });

      await client.searchStreamers("streamer");

      expect(request).toHaveBeenCalledOnce();
      expect(request.mock.calls[0]?.[0]?.params).toMatchObject({
        query: "streamer",
        first: 20,
      });
    });
  });

  describe("EventSub subscriptions", () => {
    it("builds EventSub webhook subscription requests", async () => {
      const { client, request } = createClient();

      await client.subscribeToEvent("stream.online", {
        broadcaster_user_id: "streamer-1",
      });

      const config = request.mock.calls[0]?.[0];

      expect(config?.method).toBe("POST");
      expect(config?.url).toBe(
        "https://api.twitch.tv/helix/eventsub/subscriptions",
      );
      expect(config?.data).toMatchObject({
        type: "stream.online",
        version: "1",
        condition: { broadcaster_user_id: "streamer-1" },
        transport: {
          method: "webhook",
          callback: "http://localhost:3000/eventsub",
        },
      });
    });

    it("honours an explicit subscription version", async () => {
      const { client, request } = createClient();

      await client.subscribeToEvent("stream.online", {}, "2");

      expect(request.mock.calls[0]?.[0]?.data).toMatchObject({ version: "2" });
    });

    it("deletes a subscription by id", async () => {
      const { client, request } = createClient();

      await client.unsubscribeFromEvent("sub-1");

      const config = request.mock.calls[0]?.[0];

      expect(config?.method).toBe("DELETE");
      expect(config?.params).toEqual({ id: "sub-1" });
    });
  });

  describe("default http client", () => {
    it("reuses connections via the shared keep-alive agent", async () => {
      const axios = await import("axios");
      const { keepAliveHttpsAgent } = await import(
        "../../../../infrastructure/http/httpsAgent.js"
      );
      const create = vi.spyOn(axios.default, "create");

      new TwitchClient({ publicUrl: "http://localhost:3000" });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ httpsAgent: keepAliveHttpsAgent }),
      );

      create.mockRestore();
    });
  });
});
