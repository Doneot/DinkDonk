import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { env } from "../src/config/env.js";

export const data = new SlashCommandBuilder()
  .setName("dashboard")
  .setDescription("Get the link to your dashboard");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const url = `${env.serverUrl}/dashboard`;
  await interaction.reply({
    content: `🔧 Your dashboard: ${url}`,
    flags: MessageFlags.Ephemeral,
  });
}
