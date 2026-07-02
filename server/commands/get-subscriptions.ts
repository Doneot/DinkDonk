import { Buffer } from "node:buffer";

import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { env } from "../src/shared/config/env.js";
import type { CommandContext } from "../src/modules/discord/domain/CommandContext.js";

export const data = new SlashCommandBuilder()
  .setName("get-subscriptions")
  .setDescription("Get all eventsub subscription")
  .addStringOption((option) =>
    option
      .setName("password")
      .setDescription("Admin password required to run this cmd")
      .setRequired(true),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  const password = interaction.options.getString("password");
  const { twitch } = context;

  if (password !== env.adminPassword) {
    await interaction.reply("❌ Wrong password, you cannot use this command");
    return;
  }

  const res = await twitch.getEventSubSubscriptions();

  if (res.length === 0) {
    await interaction.reply("No current subscription");
    return;
  }

  const file = new AttachmentBuilder(
    Buffer.from(JSON.stringify(res, null, 2)),
    {
      name: "subscriptions.json",
    },
  );

  await interaction.reply({
    content: "**Current subscriptions:**",
    files: [file],
  });
}
