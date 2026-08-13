import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { execute } from "../../../../../commands/get-subscriptions.js";
import type { CommandContext } from "../../../../../modules/discord/domain/CommandContext.js";
import type { TwitchEventSubSubscription } from "../../../../../modules/twitch/domain/Twitch.js";

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
      get deferred() {
        return state.deferred;
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction,
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
  it("defers the reply immediately, before the Twitch call", async () => {
    const { interaction, deferReply } = createInteraction();
    const context = createContext([]);

    await execute(interaction, context);

    expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  });

  it("replies ephemerally that there are no subscriptions", async () => {
    const { interaction, editReply } = createInteraction();
    const context = createContext([]);

    await execute(interaction, context);

    expect(editReply).toHaveBeenCalledWith({
      content: "No current subscription",
    });
  });

  it("replies ephemerally with a subscriptions file when subscriptions exist", async () => {
    const { interaction, editReply } = createInteraction();
    const context = createContext([
      { id: "sub-1" } as unknown as TwitchEventSubSubscription,
    ]);

    await execute(interaction, context);

    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "**Current subscriptions:**",
        files: expect.arrayContaining([expect.anything()]) as unknown[],
      }),
    );
  });

  it("restricts the command to administrators", async () => {
    const { data } = await import("../../../../../commands/get-subscriptions.js");

    expect(data.toJSON().default_member_permissions).toBe("8");
  });

  it("restricts the command to guild context, since default_member_permissions alone isn't enforced in a DM", async () => {
    const { data } = await import("../../../../../commands/get-subscriptions.js");

    expect(data.toJSON().contexts).toEqual([0]);
  });
});
