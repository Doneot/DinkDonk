import { afterEach, describe, expect, it, vi } from "vitest";

import { EventSubSyncService } from "../../../../modules/notifications/application/EventSubSyncService.js";
import type { TwitchEventSubSubscription } from "../../../../modules/twitch/domain/Twitch.js";
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
        subscriptions: [
          buildEventSubSubscription(),
          buildEventSubSubscription({ id: "sub-2", type: "stream.offline" }),
        ],
        streamers: [buildStreamer({ id: "streamer-1" })],
      });

      await service.syncEventSubSubscriptions();

      expect(twitch.subscriptions).toHaveLength(2);
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

      // Two subscriptions (stream.online + stream.offline) created for the
      // one streamer that succeeded; streamer-1 failed on its very first
      // (stream.online) attempt, so stream.offline was never even tried.
      expect(twitch.broadcasterIds()).toEqual(["streamer-2", "streamer-2"]);
    });

    it("syncs every streamer across more than one batch", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      // SYNC_BATCH_SIZE is 25 - 30 streamers spans exactly two batches.
      const streamers = Array.from({ length: 30 }, (_, i) =>
        buildStreamer({ id: `streamer-${i}` }),
      );

      const { service, twitch } = setup({ subscriptions: [], streamers });

      await service.syncEventSubSubscriptions();

      // Each streamer gets both stream.online and stream.offline.
      const expectedIds = streamers
        .flatMap((streamer) => [streamer.id, streamer.id])
        .sort();

      expect(twitch.broadcasterIds().sort()).toEqual(expectedIds);
    });
  });

  describe("handleStreamerAdded", () => {
    it("subscribes a streamer that has no stream.online subscription yet", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const { service, twitch } = setup({ subscriptions: [] });

      await service.handleStreamerAdded("streamer-9");

      expect(twitch.broadcasterIds()).toEqual(["streamer-9", "streamer-9"]);
    });

    it("is a no-op when the streamer is already subscribed", async () => {
      const { service, twitch } = setup({
        subscriptions: [
          buildEventSubSubscription(),
          buildEventSubSubscription({ id: "sub-2", type: "stream.offline" }),
        ],
      });

      await service.handleStreamerAdded("streamer-1");

      expect(twitch.subscriptions).toHaveLength(2);
    });

    it("does not create a duplicate subscription when two calls race for the same streamer", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const { service, twitch } = setup({ subscriptions: [] });
      const subscribeToEvent = vi.spyOn(twitch, "subscribeToEvent");

      await Promise.all([
        service.handleStreamerAdded("streamer-9"),
        service.handleStreamerAdded("streamer-9"),
      ]);

      // One call per tracked type (stream.online, stream.offline) - never
      // more, even though two callers raced for the same streamer.
      expect(subscribeToEvent).toHaveBeenCalledTimes(2);
      expect(subscribeToEvent.mock.calls.map((call) => call[0]).sort()).toEqual([
        "stream.offline",
        "stream.online",
      ]);
    });

    it("re-checks against fresh data before creating, so a stale snapshot doesn't cause a duplicate once a concurrent caller already created one", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const { service, twitch } = setup({ subscriptions: [] });

      // Simulates handleStreamerAdded/syncEventSubSubscriptions each
      // capturing their own subscriptions snapshot independently, at
      // different times - caller A's read below resolves (stale, still
      // empty) only after caller B has already created and released the
      // lock on a real subscription for the same streamer.
      let resolveStaleRead!: (subs: TwitchEventSubSubscription[]) => void;
      const staleRead = new Promise<TwitchEventSubSubscription[]>((resolve) => {
        resolveStaleRead = resolve;
      });

      const getEventSubSubscriptions = vi.spyOn(
        twitch,
        "getEventSubSubscriptions",
      );

      getEventSubSubscriptions.mockImplementationOnce(() => staleRead);

      const callA = service.handleStreamerAdded("streamer-9");

      await service.handleStreamerAdded("streamer-9");

      expect(twitch.broadcasterIds()).toEqual(["streamer-9", "streamer-9"]);

      resolveStaleRead([]);

      await callA;

      // Caller A's stale snapshot said "missing", but by the time it
      // actually acquired the lock, caller B had already created both
      // subscriptions - the fresh re-check inside the lock must catch that
      // instead of creating duplicates.
      expect(twitch.broadcasterIds()).toEqual(["streamer-9", "streamer-9"]);
    });

    it("ignores a subscription of another type for the same streamer", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const { service, twitch } = setup({
        subscriptions: [buildEventSubSubscription({ type: "channel.update" })],
      });

      await service.handleStreamerAdded("streamer-1");

      // The pre-existing channel.update subscription, plus a freshly
      // created stream.online and stream.offline pair.
      expect(twitch.subscriptions).toHaveLength(3);
    });
  });
});
