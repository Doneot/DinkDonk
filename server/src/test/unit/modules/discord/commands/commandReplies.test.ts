import { describe, expect, it, vi } from "vitest";
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

import {
  replyEphemeral,
  requireDMCapableUser,
} from "../../../../../commands/shared/commandReplies.js";
import type { UserRepository } from "../../../../../modules/users/ports/UserRepository.js";
import { buildUser } from "../../../../builders/user.js";
import { TEST_USER_ID } from "../../../../constants.js";

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

    const result = await requireDMCapableUser(interaction, userRepository);

    expect(result).toBe(user);
    expect(reply).not.toHaveBeenCalled();
  });

  it("replies ephemerally and returns null when the user cannot receive DMs", async () => {
    const { interaction, reply } = createInteraction();
    const userRepository = {
      getUser: vi.fn().mockResolvedValue(buildUser({ canReceiveDM: false })),
    } as unknown as UserRepository;

    const result = await requireDMCapableUser(interaction, userRepository);

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

    const result = await requireDMCapableUser(interaction, userRepository);

    expect(result).toBeNull();
    expect(reply).toHaveBeenCalledWith({
      content: "❌ I can't DM you! Please check your DM settings.",
      flags: MessageFlags.Ephemeral,
    });
  });
});
