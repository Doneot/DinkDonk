import { describe, expect, it, vi } from "vitest";

import { FirestoreStreamerRepository } from "../../../modules/streamers/infrastructure/firestore/FirestoreStreamerRepository.js";
import { createDomainEventBus } from "../../../shared/events/DomainEventBus.js";
import { logger } from "../../../shared/logger/logger.js";

import { FakeFirestore } from "../../helpers/fakeFirestore.js";

function setup() {
  const firestore = new FakeFirestore();

  return {
    firestore,
    repository: new FirestoreStreamerRepository(
      firestore.asFirestore(),
      createDomainEventBus(logger),
    ),
  };
}

describe("FirestoreStreamerRepository", () => {
  describe("getStreamers", () => {
    it("returns an empty list when the collection is empty", async () => {
      const { repository } = setup();

      await expect(repository.getStreamers()).resolves.toEqual([]);
    });

    it("returns every streamer with its document id", async () => {
      const { firestore, repository } = setup();

      firestore.write("streamers/streamer-1", { id: "streamer-1" });
      firestore.write("streamers/streamer-2", { id: "streamer-2" });

      await expect(repository.getStreamers()).resolves.toEqual([
        { id: "streamer-1" },
        { id: "streamer-2" },
      ]);
    });
  });

  describe("getStreamer", () => {
    it("returns the stored streamer", async () => {
      const { firestore, repository } = setup();

      firestore.write("streamers/streamer-1", { id: "streamer-1" });

      await expect(repository.getStreamer("streamer-1")).resolves.toEqual({
        id: "streamer-1",
      });
    });

    it("returns null for an unknown streamer", async () => {
      const { repository } = setup();

      await expect(repository.getStreamer("streamer-1")).resolves.toBeNull();
    });

    it.each(["", "   "])(
      "returns null for the blank id %j without reading",
      async (id) => {
        const { repository } = setup();

        await expect(repository.getStreamer(id)).resolves.toBeNull();
      },
    );
  });

  describe("createStreamer", () => {
    it("writes a streamer document and announces it", async () => {
      const { firestore, repository } = setup();

      const listener = vi.fn();

      repository.events.on("streamerAdded", listener);

      await repository.createStreamer("streamer-1");

      expect(firestore.read("streamers/streamer-1")).toEqual({
        id: "streamer-1",
      });
      expect(listener.mock.calls).toEqual([
        [{ type: "streamerAdded", streamerId: "streamer-1" }],
      ]);
    });

    it("merges into an existing document rather than replacing it", async () => {
      const { firestore, repository } = setup();

      firestore.write("streamers/streamer-1", {
        id: "streamer-1",
        extra: "kept",
      });

      await repository.createStreamer("streamer-1");

      expect(firestore.read("streamers/streamer-1")).toEqual({
        id: "streamer-1",
        extra: "kept",
      });
    });
  });

  describe("deleteStreamer", () => {
    it("removes the streamer document", async () => {
      const { firestore, repository } = setup();

      firestore.write("streamers/streamer-1", { id: "streamer-1" });

      await repository.deleteStreamer("streamer-1");

      expect(firestore.read("streamers/streamer-1")).toBeUndefined();
    });

    it.each(["", "   "])("ignores the blank id %j", async (id) => {
      const { firestore, repository } = setup();

      firestore.write("streamers/streamer-1", { id: "streamer-1" });

      await repository.deleteStreamer(id);

      expect(firestore.read("streamers/streamer-1")).toBeDefined();
    });
  });

  describe("getSubscriberIds", () => {
    it("returns the ids of every subscriber document", async () => {
      const { firestore, repository } = setup();

      firestore.write("streamers/streamer-1", { id: "streamer-1" });
      firestore.write("streamers/streamer-1/subscribers/user-1", {
        subscribedAt: 1,
      });
      firestore.write("streamers/streamer-1/subscribers/user-2", {
        subscribedAt: 2,
      });

      await expect(
        repository.getSubscriberIds("streamer-1"),
      ).resolves.toEqual(["user-1", "user-2"]);
    });

    it("returns an empty list when there are no subscribers", async () => {
      const { firestore, repository } = setup();

      firestore.write("streamers/streamer-1", { id: "streamer-1" });

      await expect(
        repository.getSubscriberIds("streamer-1"),
      ).resolves.toEqual([]);
    });

    it.each(["", "   "])("returns an empty list for the blank id %j", async (id) => {
      const { repository } = setup();

      await expect(repository.getSubscriberIds(id)).resolves.toEqual([]);
    });
  });

  describe("deleteStreamerIfEmpty", () => {
    it("deletes the streamer when it has no subscribers", async () => {
      const { firestore, repository } = setup();

      firestore.write("streamers/streamer-1", { id: "streamer-1" });

      await expect(
        repository.deleteStreamerIfEmpty("streamer-1"),
      ).resolves.toBe(true);

      expect(firestore.read("streamers/streamer-1")).toBeUndefined();
    });

    it("keeps the streamer when it still has subscribers", async () => {
      const { firestore, repository } = setup();

      firestore.write("streamers/streamer-1", { id: "streamer-1" });
      firestore.write("streamers/streamer-1/subscribers/user-1", {
        subscribedAt: 1,
      });

      await expect(
        repository.deleteStreamerIfEmpty("streamer-1"),
      ).resolves.toBe(false);

      expect(firestore.read("streamers/streamer-1")).toBeDefined();
    });

    it.each(["", "   "])("returns false for the blank id %j", async (id) => {
      const { repository } = setup();

      await expect(repository.deleteStreamerIfEmpty(id)).resolves.toBe(false);
    });
  });
});
