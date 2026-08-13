import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { execute } from "../../../../../commands/subscribe.js";
import type { CommandContext } from "../../../../../modules/discord/domain/CommandContext.js";
import { buildIdentity } from "../../../../builders/auth.js";
import { buildUser } from "../../../../builders/user.js";
import { TEST_USER_ID } from "../../../../constants.js";

function createInteraction(options: Record<string, string | null> = {}) {
  const state = { deferred: false };
  const deferReply = vi.fn().mockImplementation(() => {
    state.deferred = true;
    return Promise.resolve();
  });
  const editReply = vi.fn().mockResolvedValue(undefined);

  return {
    deferReply,
    editReply,
    interaction: {
      user: { id: TEST_USER_ID },
      options: {
        getString: (name: string) => options[name] ?? null,
      },
      get deferred() {
        return state.deferred;
      },
      deferReply,
      editReply,
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
  it("defers the reply immediately, before any Twitch/Firestore call", async () => {
    const { interaction, deferReply } = createInteraction({
      username: "missing",
    });
    const context = createContext();

    await execute(interaction, context);

    expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  });

  it("replies ephemerally when the streamer cannot be found", async () => {
    const { interaction, editReply } = createInteraction({
      username: "missing",
    });
    const context = createContext();

    await execute(interaction, context);

    expect(editReply).toHaveBeenCalledWith({
      content: "❌ Could not find streamer `missing`.",
    });
  });

  it("replies ephemerally when the user cannot receive DMs", async () => {
    const { interaction, editReply } = createInteraction({
      username: "streamer",
    });
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

    expect(editReply).toHaveBeenCalledWith({
      content: "❌ I can't DM you! Please check your DM settings.",
    });
  });

  it("subscribes and confirms success", async () => {
    const { interaction, editReply } = createInteraction({
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
    expect(editReply).toHaveBeenCalledWith({
      content: "✅ Subscribed to **Streamer**!",
    });
  });

  it("reports the failure reason when subscribing fails", async () => {
    const { interaction, editReply } = createInteraction({
      username: "streamer",
    });
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

    expect(editReply).toHaveBeenCalledWith({
      content: "❌ Cannot subscribe to **Streamer**. You're already subscribed to this streamer.",
    });
  });

  it("bounds the username option to a real Twitch login's max length", async () => {
    const { data } = await import("../../../../../commands/subscribe.js");
    const username = data
      .toJSON()
      .options?.find((option) => option.name === "username");

    expect((username as { max_length?: number } | undefined)?.max_length).toBe(25);
  });
});
