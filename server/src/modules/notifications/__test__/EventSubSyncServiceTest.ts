import { describe, expect, it, vi } from "vitest";

import { EventSubSyncService } from "../application/EventSubSyncService.js";

function createTwitch() {
  return {
    getEventSubSubscriptions: vi.fn().mockResolvedValue([
      {
        id: "sub-1",
        type: "stream.online",
        status: "enabled",
        transport: {
          method: "webhook",
          callback: "https://example.com/eventsub",
        },
        condition: {
          broadcaster_user_id: "streamer-1",
        },
      },
      {
        id: "sub-2",
        type: "channel.update",
        status: "enabled",
        transport: {
          method: "webhook",
          callback: "https://example.com/eventsub",
        },
        condition: {
          broadcaster_user_id: "streamer-2",
        },
      },
    ]),
    subscribeToEvent: vi.fn().mockResolvedValue([]),
    unsubscribeFromEvent: vi.fn(),
  };
}

describe("EventSubSyncService", () => {
  it("creates stream.online subscriptions for missing streamers only", async () => {
    const twitch = createTwitch();
    const streamers = {
      on: vi.fn(),
      getStreamers: vi.fn().mockResolvedValue([
        { id: "streamer-1", users: ["user-1"] },
        { id: "streamer-3", users: ["user-2"] },
      ]),
      getStreamer: vi.fn(),
      createStreamer: vi.fn(),
      deleteStreamer: vi.fn(),
    };
    const service = new EventSubSyncService(twitch, streamers);

    await service.syncEventSubSubscriptions();

    expect(twitch.subscribeToEvent).toHaveBeenCalledTimes(1);
    expect(twitch.subscribeToEvent).toHaveBeenCalledWith("stream.online", {
      broadcaster_user_id: "streamer-3",
    });
  });

  it("filters Twitch subscriptions to stream.online records", async () => {
    const twitch = createTwitch();
    const service = new EventSubSyncService(twitch, {
      on: vi.fn(),
      getStreamers: vi.fn(),
      getStreamer: vi.fn(),
      createStreamer: vi.fn(),
      deleteStreamer: vi.fn(),
    });

    const subscriptions = await service.getStreamOnlineSubscriptions();

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]?.type).toBe("stream.online");
  });
});
