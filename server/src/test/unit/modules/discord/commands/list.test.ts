import { describe, expect, it, vi } from "vitest";
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

import { execute } from "../../../../../commands/list.js";
import type { CommandContext } from "../../../../../modules/discord/domain/CommandContext.js";
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

describe("list command", () => {
  it("tells the user when it cannot DM them", async () => {
    const { interaction, reply } = createInteraction();
    const context = {
      userRepository: {
        getUser: vi.fn().mockResolvedValue(buildUser({ canReceiveDM: false })),
      },
    } as unknown as CommandContext;

    await execute(interaction, context);

    expect(reply).toHaveBeenCalledWith({
      content: "❌ I can't DM you! Please check your DM settings.",
      flags: MessageFlags.Ephemeral,
    });
  });

  it("tells the user when they have no subscriptions", async () => {
    const { interaction, reply } = createInteraction();
    const context = {
      userRepository: {
        getUser: vi.fn().mockResolvedValue(
          buildUser({ canReceiveDM: true, subscriptions: [] }),
        ),
      },
    } as unknown as CommandContext;

    await execute(interaction, context);

    expect(reply).toHaveBeenCalledWith({
      content: "📭 You have no subscriptions yet.",
      flags: MessageFlags.Ephemeral,
    });
  });

  it("lists the display names of subscribed streamers", async () => {
    const { interaction, reply } = createInteraction();
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
      twitch: {
        fetchStreamers: vi.fn().mockResolvedValue([
          { id: "streamer-1", login: "one", display_name: "One" },
          { id: "streamer-2", login: "two", display_name: "Two" },
        ]),
      },
    } as unknown as CommandContext;

    await execute(interaction, context);

    expect(reply).toHaveBeenCalledWith({
      content: "📺 Subscribed streamers:\nOne\nTwo",
      flags: MessageFlags.Ephemeral,
    });
  });
});
