import { describe, expect, it, vi } from "vitest";

import type { StreamerRepository } from "../../../modules/streamers/ports/StreamerRepository.js";
import { buildStreamer } from "../../builders/streamer.js";
import type { Streamer } from "../../../modules/streamers/domain/Streamer.js";

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

      await expect(repository.getStreamer(streamer.id)).resolves.toEqual(
        streamer,
      );
    });

    it("returns every streamer", async () => {
      const repository = createRepository();

      repository.seed(buildStreamer({ id: "1" }));
      repository.seed(buildStreamer({ id: "2" }));

      const streamers = await repository.getStreamers();

      expect(streamers).toHaveLength(2);
    });

    it("creates a streamer", async () => {
      const repository = createRepository();

      await repository.createStreamer("streamer-1");

      await expect(repository.getStreamer("streamer-1")).resolves.toEqual({
        id: "streamer-1",
        users: [],
      });
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

      repository.on("streamerAdded", listener);

      await repository.createStreamer("streamer-1");

      expect(listener).toHaveBeenCalledWith("streamer-1");
    });

    it("clear removes every streamer", async () => {
      const repository = createRepository();

      repository.seed(buildStreamer());

      repository.clear();

      await expect(repository.getStreamers()).resolves.toEqual([]);
    });
  });
}
