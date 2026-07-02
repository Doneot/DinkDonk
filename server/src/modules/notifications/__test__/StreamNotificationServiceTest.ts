import { describe, expect, it, vi } from "vitest";

import { StreamNotificationService } from "../application/StreamNotificationService.js";
import type { TwitchEventSubStreamOnlineEvent } from "../../twitch/domain/Twitch.js";
import type { NotificationManager } from "../application/NotificationManager.js";

const event: TwitchEventSubStreamOnlineEvent = {
  broadcaster_user_id: "streamer-1",
  broadcaster_user_login: "streamer",
  broadcaster_user_name: "Streamer",
  type: "live",
  started_at: "2026-06-29T00:00:00Z",
};

describe("StreamNotificationService", () => {
  it("notifies subscribed users with their custom subscription message", async () => {
    const twitch = {
      getStreamer: vi.fn().mockResolvedValue({
        id: "streamer-1",
        login: "streamer",
        display_name: "Streamer",
        profile_image_url: "https://example.com/avatar.png",
      }),
      fetchStreamers: vi.fn(),
      searchStreamers: vi.fn(),
    };
    const users = {
      getUser: vi.fn().mockResolvedValue({
        id: "user-1",
        subscriptions: [],
      }),
      getUsers: vi.fn(),
      updateUser: vi.fn(),
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
    const subscriptions = {
      on: vi.fn(),
      getSubscription: vi.fn().mockResolvedValue({
        id: "streamer-1",
        notification_message: "Custom message",
      }),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      updateSubscription: vi.fn(),
    };
    const notify = vi
      .fn<NotificationManager["notify"]>()
      .mockResolvedValue([]);
    const notificationManager = {
      notify,
    } as unknown as NotificationManager;

    const service = new StreamNotificationService(
      twitch,
      users,
      streamers,
      subscriptions,
      notificationManager,
    );

    await service.handleStreamOnline(event);

    expect(twitch.getStreamer.mock.calls).toEqual([["streamer"]]);
    expect(subscriptions.getSubscription.mock.calls).toEqual([
      ["user-1", "streamer-1"],
    ]);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0]?.[0]).toEqual({
      id: "user-1",
      subscriptions: [],
    });
    expect(notify.mock.calls[0]?.[1]).toMatchObject({
      type: "stream.online",
      streamer: {
        id: "streamer-1",
        login: "streamer",
      },
    });
  });

  it("does not notify when Twitch cannot resolve the streamer", async () => {
    const twitch = {
      getStreamer: vi.fn().mockResolvedValue(null),
      fetchStreamers: vi.fn(),
      searchStreamers: vi.fn(),
    };
    const notify = vi.fn<NotificationManager["notify"]>();
    const notificationManager = {
      notify,
    } as unknown as NotificationManager;
    const service = new StreamNotificationService(
      twitch,
      {
        getUser: vi.fn(),
        getUsers: vi.fn(),
        updateUser: vi.fn(),
      },
      {
        on: vi.fn(),
        getStreamers: vi.fn(),
        getStreamer: vi.fn(),
        createStreamer: vi.fn(),
        deleteStreamer: vi.fn(),
      },
      {
        on: vi.fn(),
        getSubscription: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        updateSubscription: vi.fn(),
      },
      notificationManager,
    );

    await service.handleStreamOnline(event);

    expect(notify.mock.calls).toHaveLength(0);
  });
});
