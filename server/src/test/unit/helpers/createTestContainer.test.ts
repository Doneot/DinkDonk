import { describe, expect, it, vi } from "vitest";

import { createTestContainer } from "../../helpers/createTestContainer.js";

describe("createTestContainer", () => {
  it("shares one event bus between the streamer and user repositories", () => {
    const { repositories } = createTestContainer();

    expect(repositories.streamers.events).toBe(repositories.users.events);
  });

  it("shares the subscriber list between subscribing and reading subscribers", async () => {
    const { repositories } = createTestContainer();

    await repositories.users.subscribe("user-1", "streamer-1");

    await expect(
      repositories.streamers.getSubscriberIds("streamer-1"),
    ).resolves.toEqual(["user-1"]);
  });

  it("reflects an unsubscribe in the streamer repository's subscriber list", async () => {
    const { repositories } = createTestContainer();

    await repositories.users.subscribe("user-1", "streamer-1");
    await repositories.users.subscribe("user-2", "streamer-1");
    await repositories.users.unsubscribe("user-1", "streamer-1");

    await expect(
      repositories.streamers.getSubscriberIds("streamer-1"),
    ).resolves.toEqual(["user-2"]);
  });

  it("fires streamerAdded (heard by a streamer-repository listener) when subscribing creates the streamer", async () => {
    const { repositories } = createTestContainer();
    const listener = vi.fn();

    repositories.streamers.events.on("streamerAdded", listener);

    await repositories.users.subscribe("user-1", "streamer-1");

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith({
        type: "streamerAdded",
        streamerId: "streamer-1",
      });
    });
  });

  it("fires streamerEmpty (heard by a user-repository listener) when the last subscriber leaves via createStreamer/deleteStreamerIfEmpty", async () => {
    const { repositories } = createTestContainer();
    const listener = vi.fn();

    repositories.users.events.on("streamerEmpty", listener);

    await repositories.users.subscribe("user-1", "streamer-1");
    await repositories.users.unsubscribe("user-1", "streamer-1");

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith({
        type: "streamerEmpty",
        streamerId: "streamer-1",
      });
    });
  });
});
