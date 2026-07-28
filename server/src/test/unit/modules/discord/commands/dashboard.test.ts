import { describe, expect, it, vi } from "vitest";
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

import { env } from "../../../../../shared/config/env.js";
import { execute } from "../../../../../commands/dashboard.js";

function createInteraction() {
  const reply = vi.fn().mockResolvedValue(undefined);

  return {
    reply,
    interaction: { reply } as unknown as ChatInputCommandInteraction,
  };
}

describe("dashboard command", () => {
  it("replies with the local dashboard url outside production", async () => {
    const { interaction, reply } = createInteraction();

    await execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: "🔧 Your dashboard: http://localhost:5000/dashboard",
      flags: MessageFlags.Ephemeral,
    });
  });

  it("replies with the public dashboard url in production", async () => {
    env.isProduction = true;

    try {
      const { interaction, reply } = createInteraction();

      await execute(interaction);

      expect(reply).toHaveBeenCalledWith({
        content: `🔧 Your dashboard: ${env.serverUrl}/dashboard`,
        flags: MessageFlags.Ephemeral,
      });
    } finally {
      env.isProduction = false;
    }
  });
});
