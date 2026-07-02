import type { AxiosInstance, AxiosRequestConfig } from "axios";
import { describe, expect, it, vi } from "vitest";

import { TwitchClient } from "../infrastructure/TwitchClient.js";

function createHttpMock() {
  const request = vi
    .fn<
      (config: AxiosRequestConfig) => Promise<{ data: { data: unknown[] } }>
    >()
    .mockResolvedValue({
      data: {
        data: [],
      },
    });
  const post = vi.fn();

  return {
    http: {
      request,
      post,
    } as unknown as AxiosInstance,
    request,
    post,
  };
}

describe("TwitchClient", () => {
  it("requests streamer records by batching id query params", async () => {
    const { http, request: httpRequest } = createHttpMock();
    const client = new TwitchClient({ http });

    await client.fetchStreamers(["streamer-1", "streamer-2"]);

    const config = httpRequest.mock.calls[0]?.[0];
    const params = config?.params as URLSearchParams | undefined;

    expect(config?.url).toBe("https://api.twitch.tv/helix/users");
    expect(params?.getAll("id")).toEqual(["streamer-1", "streamer-2"]);
  });

  it("builds EventSub webhook subscription requests", async () => {
    const { http, request: httpRequest } = createHttpMock();
    const client = new TwitchClient({ http });

    await client.subscribeToEvent("stream.online", {
      broadcaster_user_id: "streamer-1",
    });

    const config = httpRequest.mock.calls[0]?.[0];
    const data = config?.data as
      | {
          type: string;
          version: string;
          condition: Record<string, string>;
          transport: {
            method: string;
            callback: string;
          };
        }
      | undefined;

    expect(config?.method).toBe("POST");
    expect(config?.url).toBe(
      "https://api.twitch.tv/helix/eventsub/subscriptions",
    );
    expect(data).toMatchObject({
      type: "stream.online",
      version: "1",
      condition: {
        broadcaster_user_id: "streamer-1",
      },
      transport: {
        method: "webhook",
        callback: "http://localhost:3000/eventsub",
      },
    });
  });
});
