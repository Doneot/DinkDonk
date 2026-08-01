import { describe, expect, it, vi } from "vitest";
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

import { execute } from "../../../../../commands/subscribe.js";
import type { CommandContext } from "../../../../../modules/discord/domain/CommandContext.js";
import { buildUser } from "../../../../builders/user.js";
import { buildIdentity } from "../../../../builders/auth.js";
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

function createContext(
  overrides: Omit<Partial<CommandContext>, "userRepository"> & {
    userRepository?: Partial<CommandContext["userRepository"]>;
  } = {},
): CommandContext {
  const { userRepository, ...rest } = overrides;

  return {
    twitch: { getStreamer: vi.fn().mockResolvedValue(null) },
    userRepository: {
      getUser: vi.fn().mockResolvedValue(buildUser({ canReceiveDM: true })),
      subscribe: vi.fn(),
      ...userRepository,
    },
    identityRepository: {
      getIdentityByDiscordUid: vi
        .fn()
        .mockResolvedValue(buildIdentity({ uid: TEST_USER_ID })),
    },
    ...rest,
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
      },
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
      userRepository: { subscribe },
    });

    await execute(interaction, context);

    expect(subscribe).toHaveBeenCalledWith(
      TEST_USER_ID,
      "streamer-1",
      "custom message",
    );
    expect(reply).toHaveBeenCalledWith({
      content: "✅ Subscribed to **Streamer**!",
      flags: MessageFlags.Ephemeral,
    });
  });

  it("reports the failure reason when subscribing fails", async () => {
    const { interaction, reply } = createInteraction({ username: "streamer" });
    const context = createContext({
      twitch: {
        getStreamer: vi
          .fn()
          .mockResolvedValue({ id: "streamer-1", display_name: "Streamer" }),
      } as unknown as CommandContext["twitch"],
      userRepository: {
        subscribe: vi
          .fn()
          .mockResolvedValue({ success: false, reason: "already_subscribed" }),
      },
    });

    await execute(interaction, context);

    expect(reply).toHaveBeenCalledWith({
      content: "❌ Cannot subscribe to **Streamer**. You're already subscribed to this streamer.",
      flags: MessageFlags.Ephemeral,
    });
  });
});
