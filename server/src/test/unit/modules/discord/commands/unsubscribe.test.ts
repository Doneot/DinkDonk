import { describe, expect, it, vi } from "vitest";
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

import { execute } from "../../../../../commands/unsubscribe.js";
import type { CommandContext } from "../../../../../modules/discord/domain/CommandContext.js";
import { buildUser } from "../../../../builders/user.js";
import { TEST_USER_ID } from "../../../../constants.js";

function createInteraction(options: Record<string, string | null> = {}) {
  const reply = vi.fn().mockResolvedValue(undefined);

  return {
    reply,
    interaction: {
      user: { id: TEST_USER_ID },
      options: {
        getString: (name: string) => options[name] ?? null,
      },
      reply,
    } as unknown as ChatInputCommandInteraction,
  };
}

function createContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    twitch: { getStreamer: vi.fn().mockResolvedValue(null) },
    userRepository: {
      getUser: vi.fn().mockResolvedValue(buildUser({ canReceiveDM: true })),
    },
    subscriptionRepository: {
      unsubscribe: vi.fn(),
    },
    ...overrides,
  } as unknown as CommandContext;
}

describe("unsubscribe command", () => {
  it("replies ephemerally when the streamer cannot be found", async () => {
    const { interaction, reply } = createInteraction({ username: "missing" });
    const context = createContext();

    await execute(interaction, context);

    expect(reply).toHaveBeenCalledWith({
      content: "❌ Could not find streamer `missing`.",
      flags: MessageFlags.Ephemeral,
    });
  });

  it("replies ephemerally when the user cannot receive DMs", async () => {
    const { interaction, reply } = createInteraction({ username: "streamer" });
    const context = createContext({
      twitch: {
        getStreamer: vi
          .fn()
          .mockResolvedValue({ id: "streamer-1", display_name: "Streamer" }),
      } as unknown as CommandContext["twitch"],
      userRepository: {
        getUser: vi.fn().mockResolvedValue(buildUser({ canReceiveDM: false })),
      } as unknown as CommandContext["userRepository"],
    });

    await execute(interaction, context);

    expect(reply).toHaveBeenCalledWith({
      content: "❌ I can't DM you! Please check your DM settings.",
      flags: MessageFlags.Ephemeral,
    });
  });

  it("unsubscribes and confirms success", async () => {
    const { interaction, reply } = createInteraction({ username: "streamer" });
    const unsubscribe = vi
      .fn()
      .mockResolvedValue({ success: true, usersLeft: 0 });
    const context = createContext({
      twitch: {
        getStreamer: vi
          .fn()
          .mockResolvedValue({ id: "streamer-1", display_name: "Streamer" }),
      } as unknown as CommandContext["twitch"],
      subscriptionRepository: {
        unsubscribe,
      } as unknown as CommandContext["subscriptionRepository"],
    });

    await execute(interaction, context);

    expect(unsubscribe).toHaveBeenCalledWith(TEST_USER_ID, "streamer-1");
    expect(reply).toHaveBeenCalledWith({
      content: "✅ Unsubscribed from **Streamer**.",
      flags: MessageFlags.Ephemeral,
    });
  });

  it("reports the failure reason when unsubscribing fails", async () => {
    const { interaction, reply } = createInteraction({ username: "streamer" });
    const context = createContext({
      twitch: {
        getStreamer: vi
          .fn()
          .mockResolvedValue({ id: "streamer-1", display_name: "Streamer" }),
      } as unknown as CommandContext["twitch"],
      subscriptionRepository: {
        unsubscribe: vi
          .fn()
          .mockResolvedValue({ success: false, reason: "user_not_found" }),
      } as unknown as CommandContext["subscriptionRepository"],
    });

    await execute(interaction, context);

    expect(reply).toHaveBeenCalledWith({
      content: "❌ Cannot unsubscribe from **Streamer**. Reason: user_not_found",
      flags: MessageFlags.Ephemeral,
    });
  });
});
