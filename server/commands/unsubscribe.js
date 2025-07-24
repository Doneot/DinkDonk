// server/commands/unsubscribe.js
const { SlashCommandBuilder, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unsubscribe")
    .setDescription("Unsubscribe from a Twitch streamer")
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("Twitch username")
        .setRequired(true)
    ),

  async execute(interaction, context) {
    const username = interaction.options.getString("username");
    const { firestore, twitch } = context;

    const streamer = await twitch.getStreamer(username);
    if (!streamer) {
      return await interaction.reply({
        content: `❌ Could not find streamer \`${username}\`.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const user = await firestore.getUser(interaction.user.id);
    const canReceiveDM = user?.canReceiveDM || false;
    if (!canReceiveDM) {
      return await interaction.reply({
        content: `❌ I can't DM you! Please check your DM settings.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const res = await firestore.unsubscribe(interaction.user.id, streamer.id);

    await interaction.reply(
      res.success
        ? `✅ Unsubscribed from **${streamer.display_name}**.`
        : `❌ Cannot unsubscribe from **${streamer.display_name}**. Reason: ${res.reason}`
    );
  },
};
