import { afterEach, describe, expect, it, vi } from "vitest";

import { DiscordNotificationChannel } from "../../../../modules/notifications/infrastructure/channels/DiscordNotificationChannel.js";
import type { Notification } from "../../../../modules/notifications/domain/Notification.js";
import type { User } from "../../../../modules/users/domain/User.js";
import { logger } from "../../../../shared/logger/logger.js";

import { buildUser } from "../../../builders/user.js";
import { InMemoryUserRepository } from "../../../repositories/inMemory/InMemoryUserRepository.js";

const notification: Notification = {
  type: "stream.online",
  title: "Streamer is live!",
  body: "Streamer is live!",
  url: "https://www.twitch.tv/streamer",
};

function setup(user: User = buildUser({ canReceiveDM: true })) {
  const notifyUser = vi.fn().mockResolvedValue(undefined);
  const userRepository = new InMemoryUserRepository();

  userRepository.seed(user);

  return {
    user,
    notifyUser,
    userRepository,
    channel: new DiscordNotificationChannel({
      discord: { notifyUser },
      userRepository,
    }),
  };
}

function discordError(code: number | undefined, message = "Cannot send DM") {
  return Object.assign(new Error(message), { code });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DiscordNotificationChannel", () => {
  it("is named discord", () => {
    expect(setup().channel.name).toBe("discord");
  });

  it("sends the notification body and url as a direct message", async () => {
    const { channel, notifyUser, user } = setup();

    await expect(channel.send(user, notification)).resolves.toEqual({
      sent: true,
    });

    expect(notifyUser.mock.calls).toEqual([
      [user.id, "Streamer is live!\nhttps://www.twitch.tv/streamer"],
    ]);
  });

  it.each([
    ["a user with DMs disabled", buildUser({ canReceiveDM: false })],
    [
      "a user with no DM preference",
      { id: "user-1", subscriptions: [] } satisfies User,
    ],
  ])("skips %s", async (_label, user) => {
    const { channel, notifyUser } = setup(user);

    await expect(channel.send(user, notification)).resolves.toEqual({
      sent: false,
      skipped: true,
      reason: "dm_disabled",
    });

    expect(notifyUser).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("skips a %s user", async (_label, user) => {
    const { channel, notifyUser } = setup();

    await expect(channel.send(user, notification)).resolves.toMatchObject({
      sent: false,
      skipped: true,
      reason: "dm_disabled",
    });

    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("disables DMs for the user when Discord reports a closed DM channel", async () => {
    const { channel, notifyUser, user, userRepository } = setup();

    notifyUser.mockRejectedValue(discordError(50007));

    await expect(channel.send(user, notification)).resolves.toEqual({
      sent: false,
      expired: true,
      reason: "discord_dm_blocked",
    });

    await expect(userRepository.getUser(user.id)).resolves.toMatchObject({
      canReceiveDM: false,
    });
  });

  it("reports an unexpected Discord failure without changing the user", async () => {
    const error = vi.spyOn(logger, "error").mockReturnValue();
    const { channel, notifyUser, user, userRepository } = setup();

    notifyUser.mockRejectedValue(discordError(50001, "Missing access"));

    await expect(channel.send(user, notification)).resolves.toEqual({
      sent: false,
      reason: "Missing access",
    });

    expect(error.mock.calls[0]?.[0]).toMatchObject({
      userId: user.id,
      message: "Missing access",
    });
    await expect(userRepository.getUser(user.id)).resolves.toMatchObject({
      canReceiveDM: true,
    });
  });

  it("falls back to unknown_error when the failure carries no message", async () => {
    vi.spyOn(logger, "error").mockReturnValue();

    const { channel, notifyUser, user } = setup();

    notifyUser.mockRejectedValue({ code: 500 });

    await expect(channel.send(user, notification)).resolves.toEqual({
      sent: false,
      reason: "unknown_error",
    });
  });
});
