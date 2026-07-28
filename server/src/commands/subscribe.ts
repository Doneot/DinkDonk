import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { CommandContext } from "../modules/discord/domain/CommandContext.js";

export const data = new SlashCommandBuilder()
  .setName("subscribe")
  .setDescription("Subscribe to a Twitch streamer")
  .addStringOption((option) =>
    option
      .setName("username")
      .setDescription("Twitch username")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("message")
      .setDescription("Custom notification message")
      .setRequired(false),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  const username = interaction.options.getString("username", true);

  const notificationMessage = interaction.options.getString("message");

  const { userRepository, subscriptionRepository, twitch } = context;

  const streamer = await twitch.getStreamer(username);

  if (!streamer) {
    await interaction.reply({
      content: `❌ Could not find streamer \`${username}\`.`,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const user = await userRepository.getUser(interaction.user.id);

  const canReceiveDM = user?.canReceiveDM || false;

  if (!canReceiveDM) {
    await interaction.reply({
      content: `❌ I can't DM you! Please check your DM settings.`,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const res = await subscriptionRepository.subscribe(
    interaction.user.id,
    streamer.id,
    notificationMessage || undefined,
  );

  await interaction.reply(
    res.success
      ? `✅ Subscribed to **${streamer.display_name}**!`
      : `❌ Cannot subscribe to **${streamer.display_name}**. Reason: ${res.reason}`,
  );
}
