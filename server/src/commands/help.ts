import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { replyEphemeral } from "./shared/commandReplies.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show help for all bot commands");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const helpText = `
📖 **Available Commands**
• \`/subscribe <username> <notification-message>\` — Get notified when a streamer goes live.
• \`/unsubscribe <username>\` — Stop receiving notifications.
• \`/list\` — View all your notification subscriptions.
• \`/set-message <message>\` — Customize notification message.
• \`/dashboard\` — Access your dashboard.
• \`/help\` — Show this help message.
  `;
  await replyEphemeral(interaction, helpText);
}
