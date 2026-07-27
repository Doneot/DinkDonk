import { describe, expect, it, vi } from "vitest";

import { SubscriptionCleanupService } from "../../../../modules/notifications/application/SubscriptionCleanupService.js";
import type { TwitchEventSubSubscription } from "../../../../modules/twitch/domain/Twitch.js";

import { buildStreamer } from "../../../builders/streamer.js";
import {
  buildEventSubSubscription,
  FakeTwitchSubscriptions,
} from "../../../helpers/fakeTwitch.js";
import { InMemoryStreamerRepository } from "../../../repositories/inMemory/InMemoryStreamerRepository.js";

function setup({
  subscriptions = [] as TwitchEventSubSubscription[],
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
    service: new SubscriptionCleanupService(twitch, streamerRepository),
  };
}

describe("SubscriptionCleanupService", () => {
  describe("garbageCollectStreamer", () => {
    it("removes EventSub subscriptions and streamer records with no users", async () => {
      const { service, twitch, streamerRepository } = setup({
        subscriptions: [buildEventSubSubscription({ id: "sub-1" })],
        streamers: [buildStreamer({ id: "streamer-1", users: [] })],
      });

      await service.garbageCollectStreamer("streamer-1");

      expect(twitch.subscriptions).toEqual([]);
      await expect(
        streamerRepository.getStreamer("streamer-1"),
      ).resolves.toBeNull();
    });

    it("keeps active streamer records", async () => {
      const { service, twitch, streamerRepository } = setup({
        subscriptions: [buildEventSubSubscription({ id: "sub-1" })],
        streamers: [buildStreamer({ id: "streamer-1", users: ["user-1"] })],
      });

      await service.garbageCollectStreamer("streamer-1");

      expect(twitch.subscriptions).toHaveLength(1);
      await expect(
        streamerRepository.getStreamer("streamer-1"),
      ).resolves.not.toBeNull();
    });

    it("cleans up a streamer that no longer has a record", async () => {
      const { service, twitch } = setup({
        subscriptions: [buildEventSubSubscription({ id: "sub-1" })],
      });

      await service.garbageCollectStreamer("streamer-1");

      expect(twitch.subscriptions).toEqual([]);
    });

    it("treats a streamer record without a users field as empty", async () => {
      const { service, twitch } = setup({
        subscriptions: [buildEventSubSubscription({ id: "sub-1" })],
        streamers: [{ id: "streamer-1" }],
      });

      await service.garbageCollectStreamer("streamer-1");

      expect(twitch.subscriptions).toEqual([]);
    });

    it("removes every matching subscription for the streamer", async () => {
      const { service, twitch } = setup({
        subscriptions: [
          buildEventSubSubscription({ id: "sub-1" }),
          buildEventSubSubscription({ id: "sub-2" }),
        ],
      });

      await service.garbageCollectStreamer("streamer-1");

      expect(twitch.subscriptions).toEqual([]);
    });

    it("leaves subscriptions belonging to other streamers and types", async () => {
      const { service, twitch } = setup({
        subscriptions: [
          buildEventSubSubscription({
            id: "sub-other",
            condition: { broadcaster_user_id: "streamer-2" },
          }),
          buildEventSubSubscription({
            id: "sub-follow",
            type: "channel.follow",
          }),
        ],
      });

      await service.garbageCollectStreamer("streamer-1");

      expect(twitch.subscriptions.map((sub) => sub.id)).toEqual([
        "sub-other",
        "sub-follow",
      ]);
    });
  });

  describe("garbageCollectSubscriptions", () => {
    it("drops subscriptions whose streamer has no subscribers left", async () => {
      const { service, twitch, streamerRepository } = setup({
        subscriptions: [
          buildEventSubSubscription({
            id: "sub-empty",
            condition: { broadcaster_user_id: "streamer-empty" },
          }),
          buildEventSubSubscription({
            id: "sub-active",
            condition: { broadcaster_user_id: "streamer-active" },
          }),
        ],
        streamers: [
          buildStreamer({ id: "streamer-empty", users: [] }),
          buildStreamer({ id: "streamer-active", users: ["user-1"] }),
        ],
      });

      await service.garbageCollectSubscriptions();

      expect(twitch.subscriptions.map((sub) => sub.id)).toEqual(["sub-active"]);
      await expect(
        streamerRepository.getStreamer("streamer-empty"),
      ).resolves.toBeNull();
      await expect(
        streamerRepository.getStreamer("streamer-active"),
      ).resolves.not.toBeNull();
    });

    it("drops subscriptions for streamers that no longer exist", async () => {
      const { service, twitch } = setup({
        subscriptions: [buildEventSubSubscription({ id: "sub-1" })],
      });

      await service.garbageCollectSubscriptions();

      expect(twitch.subscriptions).toEqual([]);
    });

    it("drops subscriptions for a streamer record without a users field", async () => {
      const { service, twitch } = setup({
        subscriptions: [buildEventSubSubscription({ id: "sub-1" })],
        streamers: [{ id: "streamer-1" }],
      });

      await service.garbageCollectSubscriptions();

      expect(twitch.subscriptions).toEqual([]);
    });

    it("ignores subscriptions of other types", async () => {
      const { service, twitch } = setup({
        subscriptions: [
          buildEventSubSubscription({ id: "sub-1", type: "channel.follow" }),
        ],
      });

      await service.garbageCollectSubscriptions();

      expect(twitch.subscriptions).toHaveLength(1);
    });

    it("skips a subscription without a broadcaster condition", async () => {
      const { service, twitch } = setup({
        subscriptions: [
          buildEventSubSubscription({
            id: "sub-1",
            condition:
              undefined as unknown as TwitchEventSubSubscription["condition"],
          }),
        ],
      });

      await service.garbageCollectSubscriptions();

      expect(twitch.subscriptions).toHaveLength(1);
    });

    it("does not start a second sweep while one is in flight", async () => {
      const { service, twitch } = setup({
        subscriptions: [buildEventSubSubscription({ id: "sub-1" })],
        streamers: [buildStreamer({ id: "streamer-1", users: ["user-1"] })],
      });

      const getSubscriptions = vi.spyOn(twitch, "getEventSubSubscriptions");

      await Promise.all([
        service.garbageCollectSubscriptions(),
        service.garbageCollectSubscriptions(),
      ]);

      expect(getSubscriptions).toHaveBeenCalledOnce();
    });

    it("releases the guard after a failing sweep", async () => {
      const { service, twitch } = setup();

      const getSubscriptions = vi
        .spyOn(twitch, "getEventSubSubscriptions")
        .mockRejectedValueOnce(new Error("twitch unavailable"));

      await expect(service.garbageCollectSubscriptions()).rejects.toThrow(
        "twitch unavailable",
      );

      await service.garbageCollectSubscriptions();

      expect(getSubscriptions).toHaveBeenCalledTimes(2);
    });
  });
});
