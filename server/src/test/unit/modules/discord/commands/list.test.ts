import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { execute } from "../../../../../commands/list.js";
import type { CommandContext } from "../../../../../modules/discord/domain/CommandContext.js";
import { buildIdentity } from "../../../../builders/auth.js";
import { buildUser } from "../../../../builders/user.js";
import { TEST_USER_ID } from "../../../../constants.js";

function createInteraction() {
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
      get deferred() {
        return state.deferred;
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction,
  };
}

function identityRepository() {
  return {
    getIdentityByDiscordUid: vi
      .fn()
      .mockResolvedValue(buildIdentity({ uid: TEST_USER_ID })),
  };
}

describe("list command", () => {
  it("defers the reply immediately, before any Twitch/Firestore call", async () => {
    const { interaction, deferReply } = createInteraction();
    const context = {
      userRepository: {
        getUser: vi.fn().mockResolvedValue(buildUser({ canReceiveDM: false })),
      },
      identityRepository: identityRepository(),
    } as unknown as CommandContext;

    await execute(interaction, context);

    expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  });

  it("tells the user when it cannot DM them", async () => {
    const { interaction, editReply } = createInteraction();
    const context = {
      userRepository: {
        getUser: vi.fn().mockResolvedValue(buildUser({ canReceiveDM: false })),
      },
      identityRepository: identityRepository(),
    } as unknown as CommandContext;

    await execute(interaction, context);

    expect(editReply).toHaveBeenCalledWith({
      content: "❌ I can't DM you! Please check your DM settings.",
    });
  });

  it("tells the user when they have no subscriptions", async () => {
    const { interaction, editReply } = createInteraction();
    const context = {
      userRepository: {
        getUser: vi.fn().mockResolvedValue(
          buildUser({ canReceiveDM: true, subscriptions: [] }),
        ),
      },
      identityRepository: identityRepository(),
    } as unknown as CommandContext;

    await execute(interaction, context);

    expect(editReply).toHaveBeenCalledWith({
      content: "📭 You have no subscriptions yet.",
    });
  });

  it("lists the display names of subscribed streamers", async () => {
    const { interaction, editReply } = createInteraction();
    const context = {
      userRepository: {
        getUser: vi.fn().mockResolvedValue(
          buildUser({
            canReceiveDM: true,
            subscriptions: [
              { id: "streamer-1", notification_message: "" },
              { id: "streamer-2", notification_message: "" },
            ],
          }),
        ),
      },
      identityRepository: identityRepository(),
      twitch: {
        fetchStreamers: vi.fn().mockResolvedValue([
          { id: "streamer-1", login: "one", display_name: "One" },
          { id: "streamer-2", login: "two", display_name: "Two" },
        ]),
      },
    } as unknown as CommandContext;

    await execute(interaction, context);

    expect(editReply).toHaveBeenCalledWith({
      content: "📺 Subscribed streamers:\nOne\nTwo",
    });
  });
});
