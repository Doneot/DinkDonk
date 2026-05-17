// server/commands/dashboard.js
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { env } = require("../src/config/env");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Get the link to your dashboard"),

  async execute(interaction) {
    const url = `${env.serverUrl}/dashboard`;
    await interaction.reply({
      content: `🔧 Your dashboard: ${url}`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
