import { describe, expect, it, vi } from "vitest";
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

import { execute } from "../../../../../commands/set-message.js";
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
      updateSubscription: vi.fn(),
    },
    ...overrides,
  } as unknown as CommandContext;
}

describe("set-message command", () => {
  it("replies ephemerally when the streamer cannot be found", async () => {
    const { interaction, reply } = createInteraction({
      username: "missing",
      message: "hi",
    });
    const context = createContext();

    await execute(interaction, context);

    expect(reply).toHaveBeenCalledWith({
      content: "❌ Could not find streamer `missing`.",
      flags: MessageFlags.Ephemeral,
    });
  });

  it("replies ephemerally when the user cannot receive DMs", async () => {
    const { interaction, reply } = createInteraction({
      username: "streamer",
      message: "hi",
    });
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

  it("updates the message and confirms success", async () => {
    const { interaction, reply } = createInteraction({
      username: "streamer",
      message: "%s is live",
    });
    const updateSubscription = vi.fn().mockResolvedValue({ success: true });
    const context = createContext({
      twitch: {
        getStreamer: vi
          .fn()
          .mockResolvedValue({ id: "streamer-1", display_name: "Streamer" }),
      } as unknown as CommandContext["twitch"],
      subscriptionRepository: {
        updateSubscription,
      } as unknown as CommandContext["subscriptionRepository"],
    });

    await execute(interaction, context);

    expect(updateSubscription).toHaveBeenCalledWith(TEST_USER_ID, "streamer-1", {
      notification_message: "%s is live",
    });
    expect(reply).toHaveBeenCalledWith(
      "✅ Notification message updated for **Streamer**.",
    );
  });

  it("reports the failure reason when the update fails", async () => {
    const { interaction, reply } = createInteraction({
      username: "streamer",
      message: "hi",
    });
    const context = createContext({
      twitch: {
        getStreamer: vi
          .fn()
          .mockResolvedValue({ id: "streamer-1", display_name: "Streamer" }),
      } as unknown as CommandContext["twitch"],
      subscriptionRepository: {
        updateSubscription: vi.fn().mockResolvedValue({
          success: false,
          reason: "subscription_not_found",
        }),
      } as unknown as CommandContext["subscriptionRepository"],
    });

    await execute(interaction, context);

    expect(reply).toHaveBeenCalledWith(
      "❌ Cannot update message for **Streamer**. Reason: subscription_not_found",
    );
  });
});
