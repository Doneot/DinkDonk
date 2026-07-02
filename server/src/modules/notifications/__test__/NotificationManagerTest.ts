import { describe, expect, it, vi } from "vitest";

import { NotificationManager } from "../application/NotificationManager.js";
import type {
  Notification,
  NotificationChannel,
} from "../domain/Notification.js";
import type { User } from "../../users/domain/User.js";

const user: User = {
  id: "user-1",
  subscriptions: [],
};

const notification: Notification = {
  type: "stream.online",
  title: "Streamer is live",
  body: "Come watch",
  url: "https://example.com",
};

describe("NotificationManager", () => {
  it("sends a notification through every channel", async () => {
    const discordSend = vi.fn().mockResolvedValue({ sent: true });
    const webPushSend = vi
      .fn()
      .mockResolvedValue({ sent: false, skipped: true });
    const discord: NotificationChannel = {
      name: "discord",
      send: discordSend,
    };
    const webPush: NotificationChannel = {
      name: "web-push",
      send: webPushSend,
    };

    const manager = new NotificationManager([discord, webPush]);

    const results = await manager.notify(user, notification);

    expect(discordSend.mock.calls).toEqual([[user, notification]]);
    expect(webPushSend.mock.calls).toEqual([[user, notification]]);
    expect(results).toEqual([
      { status: "fulfilled", value: { sent: true } },
      { status: "fulfilled", value: { sent: false, skipped: true } },
    ]);
  });

  it("keeps other channel results when one channel fails", async () => {
    const error = new Error("boom");
    const failing: NotificationChannel = {
      name: "failing",
      send: vi.fn().mockRejectedValue(error),
    };
    const working: NotificationChannel = {
      name: "working",
      send: vi.fn().mockResolvedValue({ sent: true }),
    };

    const manager = new NotificationManager([failing, working]);

    const results = await manager.notify(user, notification);

    expect(results[0]).toEqual({ status: "rejected", reason: error });
    expect(results[1]).toEqual({
      status: "fulfilled",
      value: { sent: true },
    });
  });
});
