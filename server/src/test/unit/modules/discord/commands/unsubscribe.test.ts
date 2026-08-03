import { describe, expect, it, vi } from "vitest";
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

import { execute } from "../../../../../commands/unsubscribe.js";
import type { CommandContext } from "../../../../../modules/discord/domain/CommandContext.js";
import { buildUser } from "../../../../builders/user.js";
import { buildIdentity } from "../../../../builders/auth.js";
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
      unsubscribe: vi.fn(),
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

describe("unsubscribe command", () => {
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

  it("unsubscribes and confirms success", async () => {
    const { interaction, editReply } = createInteraction({
      username: "streamer",
    });
    const unsubscribe = vi
      .fn()
      .mockResolvedValue({ success: true, usersLeft: 0 });
    const context = createContext({
      twitch: {
        getStreamer: vi
          .fn()
          .mockResolvedValue({ id: "streamer-1", display_name: "Streamer" }),
      } as unknown as CommandContext["twitch"],
      userRepository: { unsubscribe },
    });

    await execute(interaction, context);

    expect(unsubscribe).toHaveBeenCalledWith(TEST_USER_ID, "streamer-1");
    expect(editReply).toHaveBeenCalledWith({
      content: "✅ Unsubscribed from **Streamer**.",
    });
  });

  it("reports the failure reason when unsubscribing fails", async () => {
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
        unsubscribe: vi
          .fn()
          .mockResolvedValue({ success: false, reason: "user_not_found" }),
      },
    });

    await execute(interaction, context);

    expect(editReply).toHaveBeenCalledWith({
      content: "❌ Cannot unsubscribe from **Streamer**. I couldn't find your account. Please sign in on the website first.",
    });
  });

  it("bounds the username option to a real Twitch login's max length", async () => {
    const { data } = await import("../../../../../commands/unsubscribe.js");
    const username = data
      .toJSON()
      .options?.find((option) => option.name === "username");

    expect((username as { max_length?: number } | undefined)?.max_length).toBe(25);
  });
});
