import { afterEach, describe, expect, it, vi } from "vitest";

import type { Notification } from "../../../../modules/notifications/domain/Notification.js";
import { logger } from "../../../../shared/logger/logger.js";

import { buildPushSubscription } from "../../../builders/pushSubscription.js";
import { buildUser } from "../../../builders/user.js";
import { InMemoryPushSubscriptionRepository } from "../../../repositories/inMemory/InMemoryPushSubscriptionRepository.js";

const sendNotification = vi
  .fn<(...args: unknown[]) => Promise<unknown>>()
  .mockResolvedValue(undefined);

const setVapidDetails = vi.fn<(...args: unknown[]) => void>();

vi.mock("web-push", () => ({
  default: {
    sendNotification: (...args: unknown[]) => sendNotification(...args),
    setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
  },
}));

const { WebPushNotificationChannel } =
  await import("../../../../modules/notifications/infrastructure/channels/WebPushNotificationChannel.js");

const VAPID = {
  publicKey: "public-key",
  privateKey: "private-key",
  subject: "mailto:test@example.com",
};

const user = buildUser();

const notification: Notification = {
  type: "stream.online",
  title: "Streamer is live!",
  body: "Streamer is live!",
  url: "https://www.twitch.tv/streamer",
  streamer: {
    id: "streamer-1",
    login: "streamer",
    displayName: "Streamer",
  },
};

function setup({
  vapid = VAPID,
  subscriptions = [buildPushSubscription()],
}: {
  vapid?: typeof VAPID | null;
  subscriptions?: ReturnType<typeof buildPushSubscription>[];
} = {}) {
  const pushSubscriptionRepository = new InMemoryPushSubscriptionRepository();

  for (const subscription of subscriptions) {
    pushSubscriptionRepository.seed(user.id, subscription);
  }

  return {
    pushSubscriptionRepository,
    channel: new WebPushNotificationChannel({
      pushSubscriptionRepository,
      ...(vapid ? { vapid } : {}),
    }),
  };
}

function pushError(statusCode: number | undefined, message = "push failed") {
  return Object.assign(new Error(message), { statusCode });
}

afterEach(() => {
  vi.restoreAllMocks();
  sendNotification.mockReset().mockResolvedValue(undefined);
  setVapidDetails.mockReset();
});

describe("WebPushNotificationChannel", () => {
  it("is named webPush", () => {
    expect(setup().channel.name).toBe("webPush");
  });

  it("registers the VAPID details once configured", () => {
    setup();

    expect(setVapidDetails.mock.calls).toEqual([
      [VAPID.subject, VAPID.publicKey, VAPID.privateKey],
    ]);
  });

  it.each([
    ["no vapid config", null],
    ["a missing public key", { ...VAPID, publicKey: "" }],
    ["a missing private key", { ...VAPID, privateKey: "" }],
    ["a missing subject", { ...VAPID, subject: "" }],
  ])("skips sending with %s", async (_label, vapid) => {
    const { channel } = setup({ vapid });

    await expect(channel.send(user, notification)).resolves.toEqual({
      sent: false,
      skipped: true,
      reason: "web_push_not_configured",
    });

    expect(setVapidDetails).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("skips when the user has no push subscriptions", async () => {
    const { channel } = setup({ subscriptions: [] });

    await expect(channel.send(user, notification)).resolves.toEqual({
      sent: false,
      skipped: true,
      reason: "no_push_subscriptions",
    });

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("delivers a payload carrying the notification and streamer data", async () => {
    const subscription = buildPushSubscription();
    const { channel } = setup({ subscriptions: [subscription] });

    const result = await channel.send(user, notification);

    expect(result.sent).toBe(true);

    const [target, payload, options] = sendNotification.mock.calls[0] as [
      unknown,
      string,
      unknown,
    ];

    expect(target).toEqual(subscription.subscription);
    expect(options).toEqual({ TTL: 3600 });
    expect(JSON.parse(payload)).toEqual({
      title: notification.title,
      body: notification.body,
      url: notification.url,
      icon: "/DinkDonk.png",
      badge: "/DinkDonk.png",
      data: {
        type: "stream.online",
        url: notification.url,
        streamerId: "streamer-1",
      },
    });
  });

  it("tolerates a notification without streamer metadata", async () => {
    const { channel } = setup();
    const { streamer: _streamer, ...bare } = notification;

    await channel.send(user, bare);

    const [, payload] = sendNotification.mock.calls[0] as [unknown, string];
    const { data } = JSON.parse(payload) as { data: Record<string, unknown> };

    expect(data).toEqual({
      type: "stream.online",
      url: notification.url,
    });
  });

  it("marks a delivered subscription as seen", async () => {
    const subscription = buildPushSubscription();
    const { channel, pushSubscriptionRepository } = setup({
      subscriptions: [subscription],
    });
    const markSeen = vi.spyOn(
      pushSubscriptionRepository,
      "markPushSubscriptionSeen",
    );

    await channel.send(user, notification);

    expect(markSeen.mock.calls).toEqual([[user.id, subscription.id]]);
  });

  it.each([404, 410])(
    "deletes a subscription rejected with status %s",
    async (statusCode) => {
      const subscription = buildPushSubscription();
      const { channel, pushSubscriptionRepository } = setup({
        subscriptions: [subscription],
      });

      sendNotification.mockRejectedValue(pushError(statusCode));

      const result = await channel.send(user, notification);

      expect(result.sent).toBe(false);
      expect(result.results?.[0]).toEqual({
        status: "fulfilled",
        value: { sent: false, expired: true },
      });
      await expect(
        pushSubscriptionRepository.getPushSubscriptions(user.id),
      ).resolves.toEqual([]);
    },
  );

  it("keeps a subscription that failed for another reason", async () => {
    const error = vi.spyOn(logger, "error").mockReturnValue();
    const subscription = buildPushSubscription();
    const { channel, pushSubscriptionRepository } = setup({
      subscriptions: [subscription],
    });

    sendNotification.mockRejectedValue(pushError(500, "service unavailable"));

    const result = await channel.send(user, notification);

    expect(result.results?.[0]).toEqual({
      status: "fulfilled",
      value: { sent: false, reason: "service unavailable" },
    });
    expect(error.mock.calls[0]?.[0]).toMatchObject({
      userId: user.id,
      subscriptionId: subscription.id,
      statusCode: 500,
    });
    await expect(
      pushSubscriptionRepository.getPushSubscriptions(user.id),
    ).resolves.toHaveLength(1);
  });

  it("falls back to unknown_error when the failure carries no message", async () => {
    vi.spyOn(logger, "error").mockReturnValue();

    const { channel } = setup();

    sendNotification.mockRejectedValue({ statusCode: 500 });

    const result = await channel.send(user, notification);

    expect(result.results?.[0]).toEqual({
      status: "fulfilled",
      value: { sent: false, reason: "unknown_error" },
    });
  });

  it("reports success when at least one subscription accepts the push", async () => {
    const healthy = buildPushSubscription({
      subscription: {
        endpoint: "https://example.com/push/healthy",
        keys: { p256dh: "p256dh", auth: "auth" },
      },
    });
    const expired = buildPushSubscription({
      subscription: {
        endpoint: "https://example.com/push/expired",
        keys: { p256dh: "p256dh", auth: "auth" },
      },
    });

    healthy.id = "healthy";
    expired.id = "expired";

    const { channel, pushSubscriptionRepository } = setup({
      subscriptions: [healthy, expired],
    });

    sendNotification.mockImplementation((target) =>
      (target as { endpoint: string }).endpoint.endsWith("expired")
        ? Promise.reject(pushError(410))
        : Promise.resolve(undefined),
    );

    const result = await channel.send(user, notification);

    expect(result.sent).toBe(true);
    expect(result.results).toHaveLength(2);
    await expect(
      pushSubscriptionRepository.getPushSubscriptions(user.id),
    ).resolves.toEqual([expect.objectContaining({ id: "healthy" })]);
  });
});
