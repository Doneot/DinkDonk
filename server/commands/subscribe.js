// server/commands/subscribe.js
const { SlashCommandBuilder, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("subscribe")
    .setDescription("Subscribe to a Twitch streamer")
    .addStringOption(option =>
      option.setName("username").setDescription("Twitch username").setRequired(true)
    )
    .addStringOption(option =>
        option.setName("message").setDescription("Custom notification message").setRequired(false)
    ),

  async execute(interaction, context) {
    const username = interaction.options.getString("username");
    const notificationMessage = interaction.options.getString("message");
    const { firestore, twitch } = context;

    const streamer = await twitch.getStreamer(username);
    if (!streamer) {
      return await interaction.reply({
        content: `❌ Could not find streamer \`${username}\`.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const user= await firestore.getUser(interaction.user.id);
    const canReceiveDM = user?.canReceiveDM || false;
    if (!canReceiveDM) {
      return await interaction.reply({
        content: `❌ I can't DM you! Please check your DM settings.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const res = await firestore.subscribe(interaction.user.id, streamer.id, notificationMessage);

    await interaction.reply(res.success ? `✅ Subscribed to **${streamer.display_name}**!` : `❌ Cannot subscribe to **${streamer.display_name}**. Reason: ${res.reason}`);
  },
};
