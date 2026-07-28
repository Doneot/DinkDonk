import { describe, expect, it, vi } from "vitest";
import type { ChatInputCommandInteraction } from "discord.js";

import { execute } from "../../../../../commands/help.js";

describe("help command", () => {
  it("replies with a summary of every command", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = { reply } as unknown as ChatInputCommandInteraction;

    await execute(interaction);

    expect(reply).toHaveBeenCalledOnce();

    const [message] = reply.mock.calls[0] as [string];

    for (const command of [
      "/subscribe",
      "/unsubscribe",
      "/list",
      "/set-message",
      "/dashboard",
      "/help",
    ]) {
      expect(message).toContain(command);
    }
  });
});
