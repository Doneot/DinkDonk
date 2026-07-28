import { describe, expect, it, vi } from "vitest";
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

import { execute } from "../../../../../commands/get-subscriptions.js";
import type { CommandContext } from "../../../../../modules/discord/domain/CommandContext.js";
import type { TwitchEventSubSubscription } from "../../../../../modules/twitch/domain/Twitch.js";

function createInteraction() {
  const reply = vi.fn().mockResolvedValue(undefined);

  return {
    reply,
    interaction: { reply } as unknown as ChatInputCommandInteraction,
  };
}

function createContext(
  subscriptions: TwitchEventSubSubscription[],
): CommandContext {
  return {
    twitch: {
      getEventSubSubscriptions: vi.fn().mockResolvedValue(subscriptions),
    },
  } as unknown as CommandContext;
}

describe("get-subscriptions command", () => {
  it("replies ephemerally that there are no subscriptions", async () => {
    const { interaction, reply } = createInteraction();
    const context = createContext([]);

    await execute(interaction, context);

    expect(reply).toHaveBeenCalledWith({
      content: "No current subscription",
      flags: MessageFlags.Ephemeral,
    });
  });

  it("replies ephemerally with a subscriptions file when subscriptions exist", async () => {
    const { interaction, reply } = createInteraction();
    const context = createContext([
      { id: "sub-1" } as unknown as TwitchEventSubSubscription,
    ]);

    await execute(interaction, context);

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "**Current subscriptions:**",
        flags: MessageFlags.Ephemeral,
        files: expect.arrayContaining([expect.anything()]) as unknown[],
      }),
    );
  });

  it("restricts the command to administrators", async () => {
    const { data } = await import("../../../../../commands/get-subscriptions.js");

    expect(data.toJSON().default_member_permissions).toBe("8");
  });
});
