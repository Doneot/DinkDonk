// server/commands/help.js
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show help for all bot commands"),

  async execute(interaction) {
    const helpText = `
📖 **Available Commands**
• \`/subscribe <username> <notification-message>\` — Get notified when a streamer goes live.
• \`/unsubscribe <username>\` — Stop receiving notifications.
• \`/list\` — View all your notification subscriptions.
• \`/set-message <message>\` — Customize notification message.
• \`/dashboard\` — Access your dashboard.
• \`/help\` — Show this help message.
    `;
    await interaction.reply(helpText);
  },
};
