import { describe, expect, it, vi } from "vitest";

import { createTestContainer } from "../../helpers/createTestContainer.js";

describe("createTestContainer", () => {
  it("shares one event bus between the streamer and subscription repositories", () => {
    const { repositories } = createTestContainer();

    expect(repositories.streamers.events).toBe(
      repositories.subscriptions.events,
    );
  });

  it("shares the subscriber list between subscribing and reading subscribers", async () => {
    const { repositories } = createTestContainer();

    await repositories.subscriptions.subscribe("user-1", "streamer-1");

    await expect(
      repositories.streamers.getSubscriberIds("streamer-1"),
    ).resolves.toEqual(["user-1"]);
  });

  it("reflects an unsubscribe in the streamer repository's subscriber list", async () => {
    const { repositories } = createTestContainer();

    await repositories.subscriptions.subscribe("user-1", "streamer-1");
    await repositories.subscriptions.subscribe("user-2", "streamer-1");
    await repositories.subscriptions.unsubscribe("user-1", "streamer-1");

    await expect(
      repositories.streamers.getSubscriberIds("streamer-1"),
    ).resolves.toEqual(["user-2"]);
  });

  it("fires streamerAdded (heard by a streamer-repository listener) when subscribing creates the streamer", async () => {
    const { repositories } = createTestContainer();
    const listener = vi.fn();

    repositories.streamers.events.on("streamerAdded", listener);

    await repositories.subscriptions.subscribe("user-1", "streamer-1");

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith({
        type: "streamerAdded",
        streamerId: "streamer-1",
      });
    });
  });

  it("fires streamerEmpty (heard by a subscription-repository listener) when the last subscriber leaves via createStreamer/deleteStreamerIfEmpty", async () => {
    const { repositories } = createTestContainer();
    const listener = vi.fn();

    repositories.subscriptions.events.on("streamerEmpty", listener);

    await repositories.subscriptions.subscribe("user-1", "streamer-1");
    await repositories.subscriptions.unsubscribe("user-1", "streamer-1");

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith({
        type: "streamerEmpty",
        streamerId: "streamer-1",
      });
    });
  });
});
