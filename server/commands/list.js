// server/commands/list.js
const { SlashCommandBuilder, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("list")
    .setDescription("List all subscriptions to notifications you have"),

  async execute(interaction, context) {
    const { firestore, twitch } = context;

    const user= await firestore.getUser(interaction.user.id);
    const canReceiveDM = user?.canReceiveDM || false;
    if (!canReceiveDM) {
      return await interaction.reply({
        content: `❌ I can't DM you! Please check your DM settings.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if(!user?.streamers?.length) {
      await interaction.reply("📭 You have no subscriptions yet.");
      return;
    }

    const streamers = await twitch.fetchStreamers(user.streamers.map(s => s.streamer_id));

    const list = streamers.map(s => s.display_name).join("\n");
    await interaction.reply(`📺 Subscribed streamers:\n${list}`);
  },
};
