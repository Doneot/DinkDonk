import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { execute } from "../../../../../commands/set-message.js";
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
      updateSubscription: vi.fn(),
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

describe("set-message command", () => {
  it("defers the reply immediately, before any Twitch/Firestore call", async () => {
    const { interaction, deferReply } = createInteraction({
      username: "missing",
      message: "hi",
    });
    const context = createContext();

    await execute(interaction, context);

    expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  });

  it("replies ephemerally when the streamer cannot be found", async () => {
    const { interaction, editReply } = createInteraction({
      username: "missing",
      message: "hi",
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
      },
    });

    await execute(interaction, context);

    expect(editReply).toHaveBeenCalledWith({
      content: "❌ I can't DM you! Please check your DM settings.",
    });
  });

  it("updates the message and confirms success", async () => {
    const { interaction, editReply } = createInteraction({
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
      userRepository: { updateSubscription },
    });

    await execute(interaction, context);

    expect(updateSubscription).toHaveBeenCalledWith(TEST_USER_ID, "streamer-1", {
      notification_message: "%s is live",
    });
    expect(editReply).toHaveBeenCalledWith({
      content: "✅ Notification message updated for **Streamer**.",
    });
  });

  it("reports the failure reason when the update fails", async () => {
    const { interaction, editReply } = createInteraction({
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
        updateSubscription: vi.fn().mockResolvedValue({
          success: false,
          reason: "subscription_not_found",
        }),
      },
    });

    await execute(interaction, context);

    expect(editReply).toHaveBeenCalledWith({
      content:
        "❌ Cannot update message for **Streamer**. I couldn't find that subscription.",
    });
  });

  it("bounds the username option to a real Twitch login's max length", async () => {
    const { data } = await import("../../../../../commands/set-message.js");
    const username = data
      .toJSON()
      .options?.find((option) => option.name === "username");

    expect((username as { max_length?: number } | undefined)?.max_length).toBe(25);
  });
});
