import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { dashboardUrl } from "../shared/utils/urls.js";

export const data = new SlashCommandBuilder()
  .setName("dashboard")
  .setDescription("Get the link to your dashboard");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const url = dashboardUrl();
  await interaction.reply({
    content: `🔧 Your dashboard: ${url}`,
    flags: MessageFlags.Ephemeral,
  });
}
