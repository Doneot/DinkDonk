import { describe, expect, it, vi } from "vitest";
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

import {
  replyEphemeral,
  requireDMCapableUser,
} from "../../../../../commands/shared/commandReplies.js";
import type { UserRepository } from "../../../../../modules/users/ports/UserRepository.js";
import type { IdentityRepository } from "../../../../../modules/auth/ports/IdentityRepository.js";
import { buildUser } from "../../../../builders/user.js";
import { buildIdentity } from "../../../../builders/auth.js";
import { TEST_USER_ID } from "../../../../constants.js";

function buildContext(
  userRepository: UserRepository,
  identityRepository?: IdentityRepository,
) {
  return {
    userRepository,
    identityRepository:
      identityRepository ??
      ({
        getIdentityByDiscordUid: vi
          .fn()
          .mockResolvedValue(buildIdentity({ uid: TEST_USER_ID })),
      } as unknown as IdentityRepository),
  };
}

function createInteraction() {
  const reply = vi.fn().mockResolvedValue(undefined);

  return {
    reply,
    interaction: {
      user: { id: TEST_USER_ID },
      reply,
    } as unknown as ChatInputCommandInteraction,
  };
}

describe("replyEphemeral", () => {
  it("replies with the ephemeral flag set", async () => {
    const { interaction, reply } = createInteraction();

    await replyEphemeral(interaction, "hello");

    expect(reply).toHaveBeenCalledWith({
      content: "hello",
      flags: MessageFlags.Ephemeral,
    });
  });
});

describe("requireDMCapableUser", () => {
  it("returns the user when they can receive DMs", async () => {
    const { interaction, reply } = createInteraction();
    const user = buildUser({ canReceiveDM: true });
    const userRepository = {
      getUser: vi.fn().mockResolvedValue(user),
    } as unknown as UserRepository;

    const result = await requireDMCapableUser(
      interaction,
      buildContext(userRepository),
    );

    expect(result).toEqual({ user, uid: TEST_USER_ID });
    expect(reply).not.toHaveBeenCalled();
  });

  it("replies ephemerally and returns null when the user cannot receive DMs", async () => {
    const { interaction, reply } = createInteraction();
    const userRepository = {
      getUser: vi.fn().mockResolvedValue(buildUser({ canReceiveDM: false })),
    } as unknown as UserRepository;

    const result = await requireDMCapableUser(
      interaction,
      buildContext(userRepository),
    );

    expect(result).toBeNull();
    expect(reply).toHaveBeenCalledWith({
      content: "❌ I can't DM you! Please check your DM settings.",
      flags: MessageFlags.Ephemeral,
    });
  });

  it("replies ephemerally and returns null when there is no user record", async () => {
    const { interaction, reply } = createInteraction();
    const userRepository = {
      getUser: vi.fn().mockResolvedValue(null),
    } as unknown as UserRepository;

    const result = await requireDMCapableUser(
      interaction,
      buildContext(userRepository),
    );

    expect(result).toBeNull();
    expect(reply).toHaveBeenCalledWith({
      content: "❌ I can't DM you! Please check your DM settings.",
      flags: MessageFlags.Ephemeral,
    });
  });

  it("replies ephemerally and returns null when the Discord account isn't linked to any identity", async () => {
    const { interaction, reply } = createInteraction();
    const getUser = vi.fn();
    const userRepository = { getUser } as unknown as UserRepository;
    const identityRepository = {
      getIdentityByDiscordUid: vi.fn().mockResolvedValue(null),
    } as unknown as IdentityRepository;

    const result = await requireDMCapableUser(
      interaction,
      buildContext(userRepository, identityRepository),
    );

    expect(result).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      content:
        "❌ I don't recognize this Discord account yet. Please sign in on the website and link Discord first.",
      flags: MessageFlags.Ephemeral,
    });
  });

  it("resolves the user by the identity's canonical uid, not the raw Discord id", async () => {
    const { interaction } = createInteraction();
    const user = buildUser({ canReceiveDM: true });
    const getUser = vi.fn().mockResolvedValue(user);
    const userRepository = { getUser } as unknown as UserRepository;
    const identityRepository = {
      getIdentityByDiscordUid: vi
        .fn()
        .mockResolvedValue(buildIdentity({ uid: "google-primary-uid" })),
    } as unknown as IdentityRepository;

    const result = await requireDMCapableUser(
      interaction,
      buildContext(userRepository, identityRepository),
    );

    expect(getUser).toHaveBeenCalledWith("google-primary-uid");
    expect(result).toEqual({ user, uid: "google-primary-uid" });
  });
});
