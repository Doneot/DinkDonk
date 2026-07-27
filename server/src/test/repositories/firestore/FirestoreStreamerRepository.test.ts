import { describe, expect, it, vi } from "vitest";

import { FirestoreStreamerRepository } from "../../../modules/streamers/infrastructure/firestore/FirestoreStreamerRepository.js";

import { FakeFirestore } from "../../helpers/fakeFirestore.js";

function setup() {
  const firestore = new FakeFirestore();

  return {
    firestore,
    repository: new FirestoreStreamerRepository(firestore.asFirestore()),
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

      firestore.write("streamers/streamer-1", { users: ["user-1"] });
      firestore.write("streamers/streamer-2", { users: [] });

      await expect(repository.getStreamers()).resolves.toEqual([
        { id: "streamer-1", users: ["user-1"] },
        { id: "streamer-2", users: [] },
      ]);
    });
  });

  describe("getStreamer", () => {
    it("returns the stored streamer", async () => {
      const { firestore, repository } = setup();

      firestore.write("streamers/streamer-1", { users: ["user-1"] });

      await expect(repository.getStreamer("streamer-1")).resolves.toEqual({
        id: "streamer-1",
        users: ["user-1"],
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
    it("writes an empty streamer document and announces it", async () => {
      const { firestore, repository } = setup();

      const listener = vi.fn();

      repository.on("streamerAdded", listener);

      await repository.createStreamer("streamer-1");

      expect(firestore.read("streamers/streamer-1")).toEqual({
        id: "streamer-1",
        users: [],
      });
      expect(listener.mock.calls).toEqual([["streamer-1"]]);
    });

    it("merges into an existing document rather than replacing it", async () => {
      const { firestore, repository } = setup();

      firestore.write("streamers/streamer-1", {
        id: "streamer-1",
        users: ["user-1"],
        extra: "kept",
      });

      await repository.createStreamer("streamer-1");

      expect(firestore.read("streamers/streamer-1")).toEqual({
        id: "streamer-1",
        users: [],
        extra: "kept",
      });
    });
  });

  describe("deleteStreamer", () => {
    it("removes the streamer document", async () => {
      const { firestore, repository } = setup();

      firestore.write("streamers/streamer-1", { users: [] });

      await repository.deleteStreamer("streamer-1");

      expect(firestore.read("streamers/streamer-1")).toBeUndefined();
    });

    it.each(["", "   "])("ignores the blank id %j", async (id) => {
      const { firestore, repository } = setup();

      firestore.write("streamers/streamer-1", { users: [] });

      await repository.deleteStreamer(id);

      expect(firestore.read("streamers/streamer-1")).toBeDefined();
    });
  });
});
