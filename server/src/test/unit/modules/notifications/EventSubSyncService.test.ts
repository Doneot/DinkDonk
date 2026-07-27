import { afterEach, describe, expect, it, vi } from "vitest";

import { EventSubSyncService } from "../../../../modules/notifications/application/EventSubSyncService.js";
import { logger } from "../../../../shared/logger/logger.js";

import { buildStreamer } from "../../../builders/streamer.js";
import {
  buildEventSubSubscription,
  FakeTwitchSubscriptions,
} from "../../../helpers/fakeTwitch.js";
import { InMemoryStreamerRepository } from "../../../repositories/inMemory/InMemoryStreamerRepository.js";

function setup({
  subscriptions = [buildEventSubSubscription()],
  streamers = [] as ReturnType<typeof buildStreamer>[],
} = {}) {
  const twitch = new FakeTwitchSubscriptions(subscriptions);
  const streamerRepository = new InMemoryStreamerRepository();

  for (const streamer of streamers) {
    streamerRepository.seed(streamer);
  }

  return {
    twitch,
    streamerRepository,
    service: new EventSubSyncService(twitch, streamerRepository),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EventSubSyncService", () => {
  describe("getStreamOnlineSubscriptions", () => {
    it("filters Twitch subscriptions to stream.online records", async () => {
      const { service } = setup({
        subscriptions: [
          buildEventSubSubscription({ id: "sub-1" }),
          buildEventSubSubscription({ id: "sub-2", type: "channel.update" }),
        ],
      });

      const subscriptions = await service.getStreamOnlineSubscriptions();

      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0]?.id).toBe("sub-1");
    });

    it("returns an empty list when Twitch has no subscriptions", async () => {
      const { service } = setup({ subscriptions: [] });

      await expect(service.getStreamOnlineSubscriptions()).resolves.toEqual([]);
    });
  });

  describe("syncEventSubSubscriptions", () => {
    it("creates stream.online subscriptions for missing streamers only", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const { service, twitch } = setup({
        subscriptions: [
          buildEventSubSubscription({
            id: "sub-1",
            condition: { broadcaster_user_id: "streamer-1" },
          }),
          buildEventSubSubscription({
            id: "sub-2",
            type: "channel.update",
            condition: { broadcaster_user_id: "streamer-3" },
          }),
        ],
        streamers: [
          buildStreamer({ id: "streamer-1", users: ["user-1"] }),
          buildStreamer({ id: "streamer-3", users: ["user-2"] }),
        ],
      });

      await service.syncEventSubSubscriptions();

      const streamOnline = twitch.subscriptions.filter(
        (subscription) => subscription.type === "stream.online",
      );

      expect(
        streamOnline.map(
          (subscription) => subscription.condition.broadcaster_user_id,
        ),
      ).toEqual(["streamer-1", "streamer-3"]);
    });

    it("does nothing when every streamer is already subscribed", async () => {
      const { service, twitch } = setup({
        subscriptions: [buildEventSubSubscription()],
        streamers: [buildStreamer({ id: "streamer-1" })],
      });

      await service.syncEventSubSubscriptions();

      expect(twitch.subscriptions).toHaveLength(1);
    });

    it("does nothing when there are no streamers", async () => {
      const { service, twitch } = setup({ subscriptions: [], streamers: [] });

      await service.syncEventSubSubscriptions();

      expect(twitch.subscriptions).toHaveLength(0);
    });

    it("propagates a Twitch failure", async () => {
      const { service, twitch } = setup({ streamers: [buildStreamer()] });

      vi.spyOn(twitch, "getEventSubSubscriptions").mockRejectedValue(
        new Error("twitch unavailable"),
      );

      await expect(service.syncEventSubSubscriptions()).rejects.toThrow(
        "twitch unavailable",
      );
    });
  });

  describe("handleStreamerAdded", () => {
    it("subscribes a streamer that has no stream.online subscription yet", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const { service, twitch } = setup({ subscriptions: [] });

      await service.handleStreamerAdded("streamer-9");

      expect(twitch.broadcasterIds()).toEqual(["streamer-9"]);
    });

    it("is a no-op when the streamer is already subscribed", async () => {
      const { service, twitch } = setup({
        subscriptions: [buildEventSubSubscription()],
      });

      await service.handleStreamerAdded("streamer-1");

      expect(twitch.subscriptions).toHaveLength(1);
    });

    it("ignores a subscription of another type for the same streamer", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const { service, twitch } = setup({
        subscriptions: [buildEventSubSubscription({ type: "channel.update" })],
      });

      await service.handleStreamerAdded("streamer-1");

      expect(twitch.subscriptions).toHaveLength(2);
    });
  });
});
