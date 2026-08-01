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

    it("recreates a subscription that is revoked or otherwise dead, instead of treating it as still active", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const { service, twitch } = setup({
        subscriptions: [
          buildEventSubSubscription({
            id: "sub-1",
            condition: { broadcaster_user_id: "streamer-1" },
            status: "authorization_revoked",
          }),
        ],
        streamers: [buildStreamer({ id: "streamer-1" })],
      });

      await service.syncEventSubSubscriptions();

      const streamOnline = twitch.subscriptions.filter(
        (subscription) =>
          subscription.type === "stream.online" &&
          subscription.condition.broadcaster_user_id === "streamer-1",
      );

      // The dead subscription is still in the list (Twitch doesn't remove it
      // automatically), plus a freshly created replacement.
      expect(streamOnline).toHaveLength(2);
      expect(
        streamOnline.some((subscription) => subscription.status === "enabled"),
      ).toBe(true);
    });

    it("continues syncing remaining streamers when one streamer's subscription attempt fails", async () => {
      vi.spyOn(logger, "info").mockReturnValue();
      const errorSpy = vi.spyOn(logger, "error").mockReturnValue();

      const { service, twitch } = setup({
        subscriptions: [],
        streamers: [
          buildStreamer({ id: "streamer-1" }),
          buildStreamer({ id: "streamer-2" }),
        ],
      });

      vi.spyOn(twitch, "subscribeToEvent").mockImplementation(
        (type, condition) => {
          if (condition.broadcaster_user_id === "streamer-1") {
            return Promise.reject(new Error("twitch rejected streamer-1"));
          }

          return FakeTwitchSubscriptions.prototype.subscribeToEvent.call(
            twitch,
            type,
            condition,
          );
        },
      );

      await service.syncEventSubSubscriptions();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ streamerId: "streamer-1" }),
        expect.any(String),
      );

      expect(twitch.broadcasterIds()).toEqual(["streamer-2"]);
    });

    it("syncs every streamer across more than one batch", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      // SYNC_BATCH_SIZE is 25 - 30 streamers spans exactly two batches.
      const streamers = Array.from({ length: 30 }, (_, i) =>
        buildStreamer({ id: `streamer-${i}` }),
      );

      const { service, twitch } = setup({ subscriptions: [], streamers });

      await service.syncEventSubSubscriptions();

      expect(twitch.broadcasterIds().sort()).toEqual(
        streamers.map((streamer) => streamer.id).sort(),
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
