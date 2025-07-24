// server/commands/dashboard.js
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { SERVER_URL } = require("../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Get the link to your dashboard"),

  async execute(interaction) {
    const url = `${SERVER_URL}/dashboard`;
    await interaction.reply({
      content: `🔧 Your dashboard: ${url}`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
