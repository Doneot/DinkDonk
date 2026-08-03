import { afterEach, describe, expect, it, vi } from "vitest";

import { TwitchProvider } from "../../../../modules/twitch/application/TwitchProvider.js";
import type { TwitchAuthenticator } from "../../../../modules/twitch/infrastructure/TwitchAuthenticator.js";
import type { TwitchClient } from "../../../../modules/twitch/infrastructure/TwitchClient.js";
import type { TwitchEventSubSubscription } from "../../../../modules/twitch/domain/Twitch.js";
import { logger } from "../../../../shared/logger/logger.js";
import { register } from "../../../../infrastructure/metrics/prometheus.js";

const CALLBACK_URL = "http://localhost:3000/eventsub";

function subscription(
  id: string,
  callback: string,
): TwitchEventSubSubscription {
  return {
    id,
    type: "stream.online",
    status: "enabled",
    transport: { method: "webhook", callback },
    condition: { broadcaster_user_id: `broadcaster-${id}` },
  };
}

function createProvider({
  expiresIn = 3600,
  subscriptions = [] as TwitchEventSubSubscription[],
} = {}) {
  const setAccessToken = vi.fn();
  const getEventSubSubscriptions = vi.fn().mockResolvedValue(subscriptions);
  const unsubscribeFromEvent = vi.fn().mockResolvedValue([]);

  const client = {
    callbackUrl: CALLBACK_URL,
    setAccessToken,
    getEventSubSubscriptions,
    unsubscribeFromEvent,
  } as unknown as TwitchClient;

  const refreshAccessToken = vi
    .fn()
    .mockResolvedValue({ accessToken: "app-token", expiresIn });

  const authenticator = {
    refreshAccessToken,
  } as unknown as TwitchAuthenticator;

  const provider = new TwitchProvider({
    client,
    authenticator,
    refreshIntervalMs: 1_000,
  });

  return {
    provider,
    setAccessToken,
    refreshAccessToken,
    getEventSubSubscriptions,
    unsubscribeFromEvent,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  register.getSingleMetric("eventsub_subscriptions_deleted_total")?.reset();
});

async function metricsText(): Promise<string> {
  return register.metrics();
}

describe("TwitchProvider", () => {
  describe("start", () => {
    it("hands the fresh access token to the client and announces readiness", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const { provider, setAccessToken } = createProvider();
      const ready = vi.fn();

      provider.on("ready", ready);

      await provider.start();

      expect(setAccessToken.mock.calls).toEqual([["app-token"]]);
      expect(ready).toHaveBeenCalledOnce();

      await provider.stop();
    });

    it("propagates an authentication failure without emitting ready", async () => {
      const { provider, refreshAccessToken } = createProvider();
      const ready = vi.fn();

      provider.on("ready", ready);
      refreshAccessToken.mockRejectedValue(new Error("invalid_client"));

      await expect(provider.start()).rejects.toThrow("invalid_client");
      expect(ready).not.toHaveBeenCalled();
    });
  });

  describe("refresh loop", () => {
    it("refreshes once the token is due and announces the rotation", async () => {
      vi.useFakeTimers();
      vi.spyOn(logger, "info").mockReturnValue();

      const { provider, refreshAccessToken } = createProvider({
        expiresIn: 300,
      });
      const rotated = vi.fn();

      provider.on("tokenRefreshed", rotated);

      await provider.start();

      await vi.advanceTimersByTimeAsync(1_000);

      expect(refreshAccessToken).toHaveBeenCalledTimes(2);
      expect(rotated).toHaveBeenCalledOnce();

      await provider.stop();
    });

    it("skips refreshing while the current token is still valid", async () => {
      vi.useFakeTimers();
      vi.spyOn(logger, "info").mockReturnValue();

      const { provider, refreshAccessToken } = createProvider({
        expiresIn: 3600,
      });
      const rotated = vi.fn();

      provider.on("tokenRefreshed", rotated);

      await provider.start();

      await vi.advanceTimersByTimeAsync(3_000);

      expect(refreshAccessToken).toHaveBeenCalledOnce();
      expect(rotated).not.toHaveBeenCalled();

      await provider.stop();
    });

    it("logs and keeps running when a scheduled refresh fails", async () => {
      vi.useFakeTimers();
      vi.spyOn(logger, "info").mockReturnValue();

      const error = vi.spyOn(logger, "error").mockReturnValue();
      const { provider, refreshAccessToken } = createProvider({
        expiresIn: 300,
      });

      await provider.start();

      refreshAccessToken.mockRejectedValue(new Error("network down"));

      await vi.advanceTimersByTimeAsync(1_000);

      expect(error.mock.calls[0]?.[0]).toMatchObject({
        message: "network down",
      });

      await vi.advanceTimersByTimeAsync(1_000);

      expect(refreshAccessToken).toHaveBeenCalledTimes(3);

      await provider.stop();
    });
  });

  describe("stop", () => {
    it("halts the refresh loop", async () => {
      vi.useFakeTimers();
      vi.spyOn(logger, "info").mockReturnValue();

      const { provider, refreshAccessToken } = createProvider({
        expiresIn: 300,
      });

      await provider.start();
      await provider.stop();

      await vi.advanceTimersByTimeAsync(5_000);

      expect(refreshAccessToken).toHaveBeenCalledOnce();
    });

    it("leaves EventSub subscriptions alone by default", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const { provider, getEventSubSubscriptions } = createProvider();

      await provider.stop();

      expect(getEventSubSubscriptions).not.toHaveBeenCalled();
    });

    it("removes only the subscriptions pointing at this callback", async () => {
      const info = vi.spyOn(logger, "info").mockReturnValue();

      const { provider, unsubscribeFromEvent } = createProvider({
        subscriptions: [
          subscription("sub-1", CALLBACK_URL),
          subscription("sub-2", "https://other.example.com/eventsub"),
          subscription("sub-3", CALLBACK_URL),
        ],
      });

      await provider.stop({ unsubscribeEventSub: true });

      expect(unsubscribeFromEvent.mock.calls).toEqual([["sub-1"], ["sub-3"]]);
      expect(info).toHaveBeenCalledWith(
        "Removed 2 EventSub subscriptions for this callback",
      );
    });

    it("handles having no matching subscriptions", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const { provider, unsubscribeFromEvent } = createProvider({
        subscriptions: [
          subscription("sub-2", "https://other.example.com/eventsub"),
        ],
      });

      await provider.stop({ unsubscribeEventSub: true });

      expect(unsubscribeFromEvent).not.toHaveBeenCalled();
    });

    it("counts only the deletions that actually succeeded, not one whose Twitch call failed", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const { provider, unsubscribeFromEvent } = createProvider({
        subscriptions: [
          subscription("sub-1", CALLBACK_URL),
          subscription("sub-2", CALLBACK_URL),
        ],
      });

      unsubscribeFromEvent.mockImplementation((id: string) =>
        id === "sub-1"
          ? Promise.reject(new Error("twitch unreachable"))
          : Promise.resolve([]),
      );

      await expect(
        provider.stop({ unsubscribeEventSub: true }),
      ).rejects.toThrow("twitch unreachable");

      const exposition = await metricsText();

      expect(exposition).toContain(
        "eventsub_subscriptions_deleted_total 1",
      );
    });
  });
});
