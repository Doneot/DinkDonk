import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { env } from "../shared/config/env.js";

export const data = new SlashCommandBuilder()
  .setName("dashboard")
  .setDescription("Get the link to your dashboard");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const url = `${env.isProduction ? env.serverUrl : "http://localhost:5000"}/dashboard`;
  await interaction.reply({
    content: `🔧 Your dashboard: ${url}`,
    flags: MessageFlags.Ephemeral,
  });
}
