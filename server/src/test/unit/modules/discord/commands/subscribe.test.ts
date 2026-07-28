import { describe, expect, it, vi } from "vitest";
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

import { execute } from "../../../../../commands/subscribe.js";
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
      subscribe: vi.fn(),
    },
    ...overrides,
  } as unknown as CommandContext;
}

describe("subscribe command", () => {
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

  it("subscribes and confirms success", async () => {
    const { interaction, reply } = createInteraction({
      username: "streamer",
      message: "custom message",
    });
    const subscribe = vi.fn().mockResolvedValue({ success: true });
    const context = createContext({
      twitch: {
        getStreamer: vi
          .fn()
          .mockResolvedValue({ id: "streamer-1", display_name: "Streamer" }),
      } as unknown as CommandContext["twitch"],
      subscriptionRepository: {
        subscribe,
      } as unknown as CommandContext["subscriptionRepository"],
    });

    await execute(interaction, context);

    expect(subscribe).toHaveBeenCalledWith(
      TEST_USER_ID,
      "streamer-1",
      "custom message",
    );
    expect(reply).toHaveBeenCalledWith("✅ Subscribed to **Streamer**!");
  });

  it("reports the failure reason when subscribing fails", async () => {
    const { interaction, reply } = createInteraction({ username: "streamer" });
    const context = createContext({
      twitch: {
        getStreamer: vi
          .fn()
          .mockResolvedValue({ id: "streamer-1", display_name: "Streamer" }),
      } as unknown as CommandContext["twitch"],
      subscriptionRepository: {
        subscribe: vi
          .fn()
          .mockResolvedValue({ success: false, reason: "already_subscribed" }),
      } as unknown as CommandContext["subscriptionRepository"],
    });

    await execute(interaction, context);

    expect(reply).toHaveBeenCalledWith(
      "❌ Cannot subscribe to **Streamer**. Reason: already_subscribed",
    );
  });
});
