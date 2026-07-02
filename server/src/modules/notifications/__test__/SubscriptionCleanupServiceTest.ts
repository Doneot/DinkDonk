import { describe, expect, it, vi } from "vitest";

import { SubscriptionCleanupService } from "../application/SubscriptionCleanupService.js";

function streamOnlineSubscription(id: string, streamerId: string) {
  return {
    id,
    type: "stream.online",
    status: "enabled",
    transport: {
      method: "webhook",
      callback: "https://example.com/eventsub",
    },
    condition: {
      broadcaster_user_id: streamerId,
    },
  };
}

describe("SubscriptionCleanupService", () => {
  it("removes EventSub subscriptions and streamer records with no users", async () => {
    const twitch = {
      getEventSubSubscriptions: vi
        .fn()
        .mockResolvedValue([streamOnlineSubscription("sub-1", "streamer-1")]),
      subscribeToEvent: vi.fn(),
      unsubscribeFromEvent: vi.fn().mockResolvedValue([]),
    };
    const streamers = {
      on: vi.fn(),
      getStreamers: vi.fn(),
      getStreamer: vi.fn().mockResolvedValue({
        id: "streamer-1",
        users: [],
      }),
      createStreamer: vi.fn(),
      deleteStreamer: vi.fn(),
    };
    const service = new SubscriptionCleanupService(twitch, streamers);

    await service.garbageCollectStreamer("streamer-1");

    expect(twitch.unsubscribeFromEvent).toHaveBeenCalledWith("sub-1");
    expect(streamers.deleteStreamer).toHaveBeenCalledWith("streamer-1");
  });

  it("keeps active streamer records", async () => {
    const twitch = {
      getEventSubSubscriptions: vi.fn(),
      subscribeToEvent: vi.fn(),
      unsubscribeFromEvent: vi.fn(),
    };
    const streamers = {
      on: vi.fn(),
      getStreamers: vi.fn(),
      getStreamer: vi.fn().mockResolvedValue({
        id: "streamer-1",
        users: ["user-1"],
      }),
      createStreamer: vi.fn(),
      deleteStreamer: vi.fn(),
    };
    const service = new SubscriptionCleanupService(twitch, streamers);

    await service.garbageCollectStreamer("streamer-1");

    expect(twitch.getEventSubSubscriptions).not.toHaveBeenCalled();
    expect(streamers.deleteStreamer).not.toHaveBeenCalled();
  });
});
