import { describe, expect, it, vi } from "vitest";

import { EventSubSyncService } from "../../../../modules/notifications/application/EventSubSyncService.js";
import { SubscriptionCleanupService } from "../../../../modules/notifications/application/SubscriptionCleanupService.js";
import type { TwitchEventSubSubscription } from "../../../../modules/twitch/domain/Twitch.js";
import { logger } from "../../../../shared/logger/logger.js";
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

  // Shares the same twitch/streamerRepository fakes as SubscriptionCleanupService
  // below, mirroring how app/container/services.ts wires the two - so a
  // recreate routed through eventSubSync is observable via the same `twitch`
  // fake the tests already assert against.
  const eventSubSync = new EventSubSyncService(twitch, streamerRepository);

  return {
    twitch,
    streamerRepository,
    eventSubSync,
    service: new SubscriptionCleanupService(
      twitch,
      streamerRepository,
      eventSubSync,
    ),
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

    it("treats a streamer with no subscribers as empty", async () => {
      const { service, twitch } = setup({
        subscriptions: [buildEventSubSubscription({ id: "sub-1" })],
        streamers: [buildStreamer({ id: "streamer-1" })],
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

    it("recreates the EventSub subscription if a subscriber shows up while it's being removed", async () => {
      const { service, twitch, streamerRepository, eventSubSync } = setup({
        subscriptions: [buildEventSubSubscription({ id: "sub-1" })],
        streamers: [buildStreamer({ id: "streamer-1", users: [] })],
      });

      const subscribeToEvent = vi.spyOn(twitch, "subscribeToEvent");
      // The recreate must route through eventSubSync (and its
      // streamersBeingSubscribed lock/exists-check), not call
      // twitch.subscribeToEvent directly - otherwise it's a second,
      // uncoordinated creator of the same Twitch resource EventSubSyncService
      // already guards against double-creating elsewhere.
      const handleStreamerAdded = vi.spyOn(eventSubSync, "handleStreamerAdded");

      vi.spyOn(twitch, "unsubscribeFromEvent").mockImplementation(
        async (id: string) => {
          // A different user subscribes to this same streamer while its
          // EventSub subscription is mid-teardown - a realistic race, since
          // this call is a real Twitch API round trip. deleteStreamerIfEmpty
          // (below) will correctly refuse to delete the streamer doc once
          // this lands, but the subscription itself was already torn down
          // unconditionally before that re-check.
          streamerRepository.seed(
            buildStreamer({ id: "streamer-1", users: ["user-2"] }),
          );

          return FakeTwitchSubscriptions.prototype.unsubscribeFromEvent.call(
            twitch,
            id,
          );
        },
      );

      await service.garbageCollectStreamer("streamer-1");

      await expect(
        streamerRepository.getStreamer("streamer-1"),
      ).resolves.not.toBeNull();
      expect(handleStreamerAdded).toHaveBeenCalledWith("streamer-1");
      expect(subscribeToEvent).toHaveBeenCalledWith("stream.online", {
        broadcaster_user_id: "streamer-1",
      });
    });

    it("recreates the subscription when a subscriber shows up even though no subscription existed yet", async () => {
      // No existing EventSub subscription for streamer-1 at all - unlike the
      // "shows up while it's being removed" test above, `matching` will be
      // empty here from the start, not because this call deleted the last
      // one. This is reachable in production e.g. when a subscribe's own
      // streamerAdded-triggered create is still in flight (domain events
      // aren't awaited by the transaction that emits them) when the same
      // user immediately unsubscribes, followed by a different user
      // subscribing before this transactional check commits.
      const { service, twitch, streamerRepository } = setup({
        subscriptions: [],
        streamers: [buildStreamer({ id: "streamer-1", users: [] })],
      });

      const subscribeToEvent = vi.spyOn(twitch, "subscribeToEvent");

      vi.spyOn(streamerRepository, "deleteStreamerIfEmpty").mockImplementation(
        async (id: string) => {
          streamerRepository.seed(
            buildStreamer({ id: "streamer-1", users: ["user-2"] }),
          );

          return InMemoryStreamerRepository.prototype.deleteStreamerIfEmpty.call(
            streamerRepository,
            id,
          );
        },
      );

      await service.garbageCollectStreamer("streamer-1");

      expect(subscribeToEvent).toHaveBeenCalledWith("stream.online", {
        broadcaster_user_id: "streamer-1",
      });
    });

    it("does not recreate the subscription when the streamer really is empty", async () => {
      const { service, twitch } = setup({
        subscriptions: [buildEventSubSubscription({ id: "sub-1" })],
        streamers: [buildStreamer({ id: "streamer-1", users: [] })],
      });

      const subscribeToEvent = vi.spyOn(twitch, "subscribeToEvent");

      await service.garbageCollectStreamer("streamer-1");

      expect(subscribeToEvent).not.toHaveBeenCalled();
    });

    it("does not double-process the same streamer when two collections race", async () => {
      // streamersBeingCollected exists specifically so garbageCollectStreamer
      // (event-triggered) and garbageCollectSubscriptions (the periodic
      // sweep) can't both delete the same streamer's EventSub subscription
      // and double-count the "deleted" metric when they overlap for the
      // same id. Two concurrent garbageCollectStreamer calls for the same
      // streamer reproduce that exact race without needing both entry
      // points.
      const { service, twitch } = setup({
        subscriptions: [buildEventSubSubscription({ id: "sub-1" })],
      });

      const unsubscribe = vi.spyOn(twitch, "unsubscribeFromEvent");

      await Promise.all([
        service.garbageCollectStreamer("streamer-1"),
        service.garbageCollectStreamer("streamer-1"),
      ]);

      expect(unsubscribe).toHaveBeenCalledOnce();
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

    it("drops subscriptions for a streamer with no subscribers", async () => {
      const { service, twitch } = setup({
        subscriptions: [buildEventSubSubscription({ id: "sub-1" })],
        streamers: [buildStreamer({ id: "streamer-1" })],
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

    it("fetches the Twitch EventSub subscription list only once per sweep, even with multiple empty streamers", async () => {
      const { service, twitch } = setup({
        subscriptions: [
          buildEventSubSubscription({
            id: "sub-empty-1",
            condition: { broadcaster_user_id: "streamer-empty-1" },
          }),
          buildEventSubSubscription({
            id: "sub-empty-2",
            condition: { broadcaster_user_id: "streamer-empty-2" },
          }),
        ],
      });

      const getSubscriptions = vi.spyOn(twitch, "getEventSubSubscriptions");

      await service.garbageCollectSubscriptions();

      expect(getSubscriptions).toHaveBeenCalledOnce();
      expect(twitch.subscriptions).toEqual([]);
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

    it("reads a streamer's subscribers only once even with duplicate stream.online subscriptions", async () => {
      const { service, streamerRepository } = setup({
        subscriptions: [
          buildEventSubSubscription({
            id: "sub-1",
            condition: { broadcaster_user_id: "streamer-1" },
          }),
          buildEventSubSubscription({
            id: "sub-2",
            condition: { broadcaster_user_id: "streamer-1" },
          }),
        ],
        streamers: [buildStreamer({ id: "streamer-1", users: ["user-1"] })],
      });

      const getSubscriberIds = vi.spyOn(streamerRepository, "getSubscriberIds");

      await service.garbageCollectSubscriptions();

      expect(getSubscriberIds).toHaveBeenCalledOnce();
    });

    it("processes every streamer across a sweep spanning more than one batch", async () => {
      const streamerCount = 30;
      const subscriptions = Array.from({ length: streamerCount }, (_, i) =>
        buildEventSubSubscription({
          id: `sub-${i}`,
          condition: { broadcaster_user_id: `streamer-${i}` },
        }),
      );

      const { service, twitch } = setup({ subscriptions });

      await service.garbageCollectSubscriptions();

      expect(twitch.subscriptions).toEqual([]);
    });

    it("isolates one streamer's collection failure from the rest of the sweep", async () => {
      const error = vi.spyOn(logger, "error").mockReturnValue();

      const { service, twitch } = setup({
        subscriptions: [
          buildEventSubSubscription({
            id: "sub-fails",
            condition: { broadcaster_user_id: "streamer-fails" },
          }),
          buildEventSubSubscription({
            id: "sub-ok",
            condition: { broadcaster_user_id: "streamer-ok" },
          }),
        ],
      });

      vi.spyOn(twitch, "unsubscribeFromEvent").mockImplementation((id) =>
        id === "sub-fails"
          ? Promise.reject(new Error("twitch unavailable"))
          : FakeTwitchSubscriptions.prototype.unsubscribeFromEvent.call(
              twitch,
              id,
            ),
      );

      // Mirrors EventSubSyncService.syncEventSubSubscriptions's per-item
      // isolation - a single streamer's Twitch API failure resolves (rather
      // than rejects) the overall sweep, and every other streamer in the
      // same batch still gets processed.
      await expect(service.garbageCollectSubscriptions()).resolves.toBeUndefined();

      expect(twitch.subscriptions.map((sub) => sub.id)).toEqual(["sub-fails"]);
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({
          streamerId: "streamer-fails",
          error: expect.any(Error) as Error,
        }),
        "Failed to garbage-collect EventSub subscription for streamer; continuing with remaining streamers",
      );
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
