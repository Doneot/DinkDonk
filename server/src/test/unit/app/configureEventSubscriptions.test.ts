import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import type { Container } from "../../../app/container/index.js";
import { configureEventSubscriptions } from "../../../app/configureEventSubscriptions.js";

import { InMemoryStreamerRepository } from "../../repositories/inMemory/InMemoryStreamerRepository.js";
import { InMemorySubscriptionRepository } from "../../repositories/inMemory/InMemorySubscriptionRepository.js";

function setup() {
  const streamers = new InMemoryStreamerRepository();
  const subscriptions = new InMemorySubscriptionRepository();
  const twitch = new EventEmitter();

  const handleStreamerAdded = vi.fn().mockResolvedValue(undefined);
  const syncEventSubSubscriptions = vi.fn().mockResolvedValue(undefined);
  const garbageCollectStreamer = vi.fn().mockResolvedValue(undefined);
  const garbageCollectSubscriptions = vi.fn().mockResolvedValue(undefined);

  const container = {
    repositories: { streamers, subscriptions },
    services: {
      eventSubSync: { handleStreamerAdded, syncEventSubSubscriptions },
      subscriptionCleanup: {
        garbageCollectStreamer,
        garbageCollectSubscriptions,
      },
    },
    twitch,
  } as unknown as Container;

  configureEventSubscriptions(container);

  return {
    streamers,
    subscriptions,
    twitch,
    handleStreamerAdded,
    syncEventSubSubscriptions,
    garbageCollectStreamer,
    garbageCollectSubscriptions,
  };
}

describe("configureEventSubscriptions", () => {
  it("subscribes to Twitch when the streamer repository gains a streamer", async () => {
    const { streamers, handleStreamerAdded } = setup();

    await streamers.createStreamer("streamer-1");

    expect(handleStreamerAdded.mock.calls).toEqual([["streamer-1"]]);
  });

  it("subscribes to Twitch when the first user subscribes to a streamer", async () => {
    const { subscriptions, handleStreamerAdded } = setup();

    await subscriptions.subscribe("user-1", "streamer-1", "");

    expect(handleStreamerAdded.mock.calls).toEqual([["streamer-1"]]);
  });

  it("does not resubscribe when a second user subscribes", async () => {
    const { subscriptions, handleStreamerAdded } = setup();

    await subscriptions.subscribe("user-1", "streamer-1", "");
    await subscriptions.subscribe("user-2", "streamer-1", "");

    expect(handleStreamerAdded).toHaveBeenCalledOnce();
  });

  it("garbage collects a streamer once its last subscriber leaves", async () => {
    const { subscriptions, garbageCollectStreamer } = setup();

    await subscriptions.subscribe("user-1", "streamer-1", "");
    await subscriptions.unsubscribe("user-1", "streamer-1");

    expect(garbageCollectStreamer.mock.calls).toEqual([["streamer-1"]]);
  });

  it("keeps a streamer that still has subscribers", async () => {
    const { subscriptions, garbageCollectStreamer } = setup();

    await subscriptions.subscribe("user-1", "streamer-1", "");
    await subscriptions.subscribe("user-2", "streamer-1", "");
    await subscriptions.unsubscribe("user-1", "streamer-1");

    expect(garbageCollectStreamer).not.toHaveBeenCalled();
  });

  it("syncs then garbage collects when the Twitch provider becomes ready", async () => {
    const { twitch, syncEventSubSubscriptions, garbageCollectSubscriptions } =
      setup();

    const results = twitch
      .listeners("ready")
      .map((listener) => (listener as () => Promise<void>)());

    await Promise.all(results);

    expect(syncEventSubSubscriptions).toHaveBeenCalledOnce();
    expect(garbageCollectSubscriptions).toHaveBeenCalledOnce();
  });

  it("re-syncs when the Twitch token is rotated", async () => {
    const { twitch, syncEventSubSubscriptions, garbageCollectSubscriptions } =
      setup();

    await Promise.all(
      twitch
        .listeners("tokenRefreshed")
        .map((listener) => (listener as () => Promise<void>)()),
    );

    expect(syncEventSubSubscriptions).toHaveBeenCalledOnce();
    expect(garbageCollectSubscriptions).not.toHaveBeenCalled();
  });
});
