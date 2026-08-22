import { describe, expect, it, vi } from "vitest";

import type { Streamer } from "../../../modules/streamers/domain/Streamer.js";
import type { StreamerRepository } from "../../../modules/streamers/ports/StreamerRepository.js";
import { buildStreamer } from "../../builders/streamer.js";
import type { SeededRepositoryFactory } from "./SeededRepository.js";

export function streamerRepositoryBehavior(
  name: string,
  createRepository: SeededRepositoryFactory<StreamerRepository, [Streamer]>,
): void {
  describe(name, () => {
    it("starts empty", async () => {
      const repository = createRepository();

      await expect(repository.getStreamers()).resolves.toEqual([]);
      await expect(repository.getStreamer("missing")).resolves.toBeNull();
    });

    it("returns a seeded streamer", async () => {
      const repository = createRepository();

      const streamer = buildStreamer();

      repository.seed(streamer);

      await expect(repository.getStreamer(streamer.id)).resolves.toEqual({
        id: streamer.id,
        isLive: false,
        liveSince: null,
      });
    });

    it("returns every streamer", async () => {
      const repository = createRepository();

      repository.seed(buildStreamer({ id: "1" }));
      repository.seed(buildStreamer({ id: "2" }));

      const streamers = await repository.getStreamers();

      expect(streamers).toHaveLength(2);
    });

    it("bounds the result to the given limit", async () => {
      const repository = createRepository();

      repository.seed(buildStreamer({ id: "1" }));
      repository.seed(buildStreamer({ id: "2" }));
      repository.seed(buildStreamer({ id: "3" }));

      const streamers = await repository.getStreamers(2);

      expect(streamers).toHaveLength(2);
    });

    describe("getStreamersByIds", () => {
      it("returns the streamers matching the given ids, omitting unknown ones", async () => {
        const repository = createRepository();

        repository.seed(buildStreamer({ id: "1" }));
        repository.seed(buildStreamer({ id: "2" }));

        const streamers = await repository.getStreamersByIds([
          "1",
          "missing",
          "2",
        ]);

        expect(streamers.map((s) => s.id).sort()).toEqual(["1", "2"]);
      });

      it("returns an empty array for an empty id list", async () => {
        const repository = createRepository();

        await expect(repository.getStreamersByIds([])).resolves.toEqual([]);
      });

      it("de-duplicates repeated ids", async () => {
        const repository = createRepository();

        repository.seed(buildStreamer({ id: "1" }));

        const streamers = await repository.getStreamersByIds(["1", "1"]);

        expect(streamers).toHaveLength(1);
      });
    });

    it("creates a streamer", async () => {
      const repository = createRepository();

      await repository.createStreamer("streamer-1");

      await expect(repository.getStreamer("streamer-1")).resolves.toEqual({
        id: "streamer-1",
        isLive: false,
        liveSince: null,
      });
      await expect(
        repository.getSubscriberIds("streamer-1"),
      ).resolves.toEqual([]);
    });

    it("deletes a streamer", async () => {
      const repository = createRepository();

      repository.seed(buildStreamer());

      await repository.deleteStreamer("streamer-1");

      await expect(repository.getStreamer("streamer-1")).resolves.toBeNull();
    });

    it("emits streamerAdded", async () => {
      const repository = createRepository();

      const listener = vi.fn();

      repository.events.on("streamerAdded", listener);

      await repository.createStreamer("streamer-1");

      expect(listener).toHaveBeenCalledWith({
        type: "streamerAdded",
        streamerId: "streamer-1",
      });
    });

    it("re-emits streamerAdded for a streamer that already exists", async () => {
      // Regression test: the streamer doc persists even after its last
      // subscriber leaves (nothing deletes it), so a caller can't tell from
      // doc-existence alone whether this streamer currently has a live
      // EventSub subscription. Gating the emit on "was this doc just
      // created" previously meant createStreamer on a pre-existing-but-
      // unsubscribed streamer silently skipped recreating its subscription.
      const repository = createRepository();

      const listener = vi.fn();

      await repository.createStreamer("streamer-1");

      repository.events.on("streamerAdded", listener);

      await repository.createStreamer("streamer-1");

      expect(listener).toHaveBeenCalledWith({
        type: "streamerAdded",
        streamerId: "streamer-1",
      });
    });

    it("clear removes every streamer", async () => {
      const repository = createRepository();

      repository.seed(buildStreamer());

      repository.clear();

      await expect(repository.getStreamers()).resolves.toEqual([]);
    });

    it("returns the subscriber ids seeded for a streamer", async () => {
      const repository = createRepository();

      repository.seed(buildStreamer({ users: ["user-1", "user-2"] }));

      await expect(
        repository.getSubscriberIds("streamer-1"),
      ).resolves.toEqual(["user-1", "user-2"]);
    });

    it("returns no subscriber ids for an unknown streamer", async () => {
      const repository = createRepository();

      await expect(
        repository.getSubscriberIds("missing"),
      ).resolves.toEqual([]);
    });

    it("deletes a streamer with no subscribers", async () => {
      const repository = createRepository();

      repository.seed(buildStreamer({ users: [] }));

      await expect(
        repository.deleteStreamerIfEmpty("streamer-1"),
      ).resolves.toBe(true);

      await expect(repository.getStreamer("streamer-1")).resolves.toBeNull();
    });

    it("does not delete a streamer that still has subscribers", async () => {
      const repository = createRepository();

      repository.seed(buildStreamer({ users: ["user-1"] }));

      await expect(
        repository.deleteStreamerIfEmpty("streamer-1"),
      ).resolves.toBe(false);

      await expect(repository.getStreamer("streamer-1")).resolves.not.toBeNull();
    });

    describe("setLiveState", () => {
      it("marks a streamer live and returns true", async () => {
        const repository = createRepository();

        repository.seed(buildStreamer({ id: "streamer-1" }));

        await expect(
          repository.setLiveState(
            "streamer-1",
            true,
            "2024-01-01T12:00:00.000Z",
          ),
        ).resolves.toBe(true);

        await expect(repository.getStreamer("streamer-1")).resolves.toEqual({
          id: "streamer-1",
          isLive: true,
          liveSince: "2024-01-01T12:00:00.000Z",
        });
      });

      it("clears live state when the stream ends", async () => {
        const repository = createRepository();

        repository.seed(
          buildStreamer({
            id: "streamer-1",
            isLive: true,
            liveSince: "2024-01-01T12:00:00.000Z",
          }),
        );

        await expect(
          repository.setLiveState("streamer-1", false, null),
        ).resolves.toBe(true);

        await expect(repository.getStreamer("streamer-1")).resolves.toEqual({
          id: "streamer-1",
          isLive: false,
          liveSince: null,
        });
      });

      it("returns false for a streamer that doesn't exist", async () => {
        const repository = createRepository();

        await expect(
          repository.setLiveState("missing", true, "2024-01-01T12:00:00.000Z"),
        ).resolves.toBe(false);
      });

      it("returns false for the blank id", async () => {
        const repository = createRepository();

        await expect(
          repository.setLiveState("", true, "2024-01-01T12:00:00.000Z"),
        ).resolves.toBe(false);
      });
    });
  });
}
