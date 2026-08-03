import { afterEach, describe, expect, it, vi } from "vitest";

import { DiscordNotificationChannel } from "../../../../modules/notifications/infrastructure/channels/DiscordNotificationChannel.js";
import type { Notification } from "../../../../modules/notifications/domain/Notification.js";
import type { User } from "../../../../modules/users/domain/User.js";
import type { Identity } from "../../../../modules/auth/domain/Identity.js";
import { logger } from "../../../../shared/logger/logger.js";

import { buildUser } from "../../../builders/user.js";
import { buildDiscordCredential, buildIdentity } from "../../../builders/auth.js";
import { InMemoryUserRepository } from "../../../repositories/inMemory/InMemoryUserRepository.js";
import { InMemoryIdentityRepository } from "../../../repositories/inMemory/InMemoryIdentityRepository.js";

// Deliberately distinct from any default test user id, so every test below
// exercises the Discord-secondary-provider case (uid !== discord.id) unless
// it explicitly opts out - that's the case that was previously broken (see
// DiscordNotificationChannel.ts's comment: user.id was passed straight to
// notifyUser() instead of being resolved through the linked identity).
const DISCORD_ID = "discord-snowflake-1";

const notification: Notification = {
  type: "stream.online",
  title: "Streamer is live!",
  body: "Streamer is live!",
  url: "https://www.twitch.tv/streamer",
};

function setup({
  user = buildUser({ canReceiveDM: true }),
  identity = buildIdentity({
    uid: user.id,
    discord: buildDiscordCredential({ id: DISCORD_ID }),
  }),
}: { user?: User; identity?: Identity | null } = {}) {
  const notifyUser = vi.fn().mockResolvedValue(undefined);
  const invalidateDmCapabilityCache = vi.fn();
  const userRepository = new InMemoryUserRepository();
  const identityRepository = new InMemoryIdentityRepository();

  userRepository.seed(user);

  if (identity) {
    identityRepository.seed(identity);
  }

  return {
    user,
    notifyUser,
    invalidateDmCapabilityCache,
    userRepository,
    identityRepository,
    channel: new DiscordNotificationChannel({
      discord: { notifyUser, invalidateDmCapabilityCache },
      userRepository,
      identityRepository,
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

  it("sends the notification body and url to the linked Discord id, not the app's own uid", async () => {
    const { channel, notifyUser, user } = setup();

    await expect(channel.send(user, notification)).resolves.toEqual({
      sent: true,
    });

    expect(notifyUser.mock.calls).toEqual([
      [DISCORD_ID, "Streamer is live!\nhttps://www.twitch.tv/streamer"],
    ]);
    expect(DISCORD_ID).not.toBe(user.id);
  });

  it("sends to the Discord id directly when it happens to equal the uid (Discord-primary signup)", async () => {
    const user = buildUser({ id: DISCORD_ID, canReceiveDM: true });
    const { channel, notifyUser } = setup({
      user,
      identity: buildIdentity({
        uid: DISCORD_ID,
        discord: buildDiscordCredential({ id: DISCORD_ID }),
      }),
    });

    await expect(channel.send(user, notification)).resolves.toEqual({
      sent: true,
    });

    expect(notifyUser.mock.calls).toEqual([
      [DISCORD_ID, "Streamer is live!\nhttps://www.twitch.tv/streamer"],
    ]);
  });

  it.each([
    ["a user with DMs disabled", buildUser({ canReceiveDM: false })],
    [
      "a user with no DM preference",
      { id: "user-1", subscriptions: [] } satisfies User,
    ],
  ])("skips %s", async (_label, user) => {
    const { channel, notifyUser } = setup({ user });

    await expect(channel.send(user, notification)).resolves.toEqual({
      sent: false,
      skipped: true,
      reason: "dm_disabled",
    });

    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("skips a user with canReceiveDM true but no linked Discord identity", async () => {
    const user = buildUser({ canReceiveDM: true });
    const { channel, notifyUser } = setup({ user, identity: null });

    await expect(channel.send(user, notification)).resolves.toEqual({
      sent: false,
      skipped: true,
      reason: "dm_disabled",
    });

    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("skips a user whose identity has no discord credential linked", async () => {
    const user = buildUser({ canReceiveDM: true });
    const { channel, notifyUser } = setup({
      user,
      identity: buildIdentity({ uid: user.id, discord: undefined }),
    });

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

  it.each([
    [50007, "DMs closed"],
    [10013, "Unknown User"],
    [50001, "Missing Access"],
  ])(
    "disables DMs for the user when Discord reports a permanent failure (%i - %s)",
    async (code) => {
      const { channel, notifyUser, user, userRepository, invalidateDmCapabilityCache } =
        setup();

      notifyUser.mockRejectedValue(discordError(code));

      await expect(channel.send(user, notification)).resolves.toEqual({
        sent: false,
        expired: true,
        reason: "discord_dm_blocked",
      });

      await expect(userRepository.getUser(user.id)).resolves.toMatchObject({
        canReceiveDM: false,
      });

      // Without this, a still-fresh cached `true` from an earlier probe
      // (POST /can-receive-dm, an OAuth callback) could silently overwrite
      // the canReceiveDM: false just written above back to `true`, since
      // canSendDirectMessage() never sees this permanent failure directly.
      expect(invalidateDmCapabilityCache).toHaveBeenCalledWith(DISCORD_ID);
    },
  );

  it("reports an unexpected Discord failure without changing the user", async () => {
    const error = vi.spyOn(logger, "error").mockReturnValue();
    const { channel, notifyUser, user, userRepository } = setup();

    notifyUser.mockRejectedValue(discordError(500, "Internal Server Error"));

    await expect(channel.send(user, notification)).resolves.toEqual({
      sent: false,
      reason: "Internal Server Error",
    });

    expect(error.mock.calls[0]?.[0]).toMatchObject({
      userId: user.id,
      message: "Internal Server Error",
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
