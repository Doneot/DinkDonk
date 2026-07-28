import { afterEach, describe, expect, it, vi } from "vitest";

import { NotificationManager } from "../../../../modules/notifications/application/NotificationManager.js";
import type {
  Notification,
  NotificationChannel,
} from "../../../../modules/notifications/domain/Notification.js";
import type { User } from "../../../../modules/users/domain/User.js";
import { logger } from "../../../../shared/logger/logger.js";
import { register } from "../../../../infrastructure/metrics/prometheus.js";

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

afterEach(() => {
  register.getSingleMetric("notifications_sent_total")?.reset();
});

async function metricsText(): Promise<string> {
  return register.metrics();
}

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

    const exposition = await metricsText();

    expect(exposition).toContain(
      'notifications_sent_total{channel="discord",result="sent"} 1',
    );
    expect(exposition).toContain(
      'notifications_sent_total{channel="web-push",result="skipped"} 1',
    );
  });

  it("records an expired result", async () => {
    const channel: NotificationChannel = {
      name: "discord",
      send: vi.fn().mockResolvedValue({ sent: false, expired: true }),
    };

    await new NotificationManager([channel]).notify(user, notification);

    expect(await metricsText()).toContain(
      'notifications_sent_total{channel="discord",result="expired"} 1',
    );
  });

  it("records a failed result when the channel resolves without a skip/expiry reason", async () => {
    const channel: NotificationChannel = {
      name: "web-push",
      send: vi.fn().mockResolvedValue({ sent: false, reason: "unknown_error" }),
    };

    await new NotificationManager([channel]).notify(user, notification);

    expect(await metricsText()).toContain(
      'notifications_sent_total{channel="web-push",result="failed"} 1',
    );
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

    const exposition = await metricsText();

    expect(exposition).toContain(
      'notifications_sent_total{channel="failing",result="error"} 1',
    );
    expect(exposition).toContain(
      'notifications_sent_total{channel="working",result="sent"} 1',
    );
  });

  it("logs the failing channel before re-throwing", async () => {
    const error = vi.spyOn(logger, "error").mockReturnValue();
    const failing: NotificationChannel = {
      name: "failing",
      send: vi.fn().mockRejectedValue(new Error("boom")),
    };

    await new NotificationManager([failing]).notify(user, notification);

    expect(error.mock.calls[0]?.[0]).toMatchObject({
      channel: "failing",
      userId: user.id,
      notificationType: "stream.online",
      message: "boom",
    });

    vi.restoreAllMocks();
  });

  it("resolves with no results when no channels are configured", async () => {
    await expect(
      new NotificationManager().notify(user, notification),
    ).resolves.toEqual([]);
  });
});
