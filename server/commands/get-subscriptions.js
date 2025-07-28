// server/commands/set-message.js
const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { ADMIN_PASSWORD } = require("../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("get-subscriptions")
    .setDescription("Get all eventsub subscription")
    .addStringOption((option) =>
      option
        .setName("password")
        .setDescription("Admin password required to run this cmd")
        .setRequired(true)
    ),

  async execute(interaction, context) {
    const password = interaction.options.getString("password");
    const { twitch } = context;

    if (password !== ADMIN_PASSWORD) {
      await interaction.reply("❌ Wrong password, you cannot use this command");
      return;
    }

    const res = await twitch.getSubscriptions();

    if (res.length === 0) {
      await interaction.reply("No current subscription");
      return;
    }

    const file = new AttachmentBuilder(
      Buffer.from(JSON.stringify(res, null, 2)),
      {
        name: "subscriptions.json",
      }
    );

    await interaction.reply({
      content: "**Current subscriptions:**",
      files: [file],
    });
  },
};
