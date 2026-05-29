import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type {
  UserReaderService,
  MessageService,
} from "../src/types/services/firestore.js";
import type { TwitchStreamerService } from "../src/types/services/twitch.js";

type Context = {
  firestore: UserReaderService & MessageService;
  twitch: TwitchStreamerService;
};

export const data = new SlashCommandBuilder()
  .setName("set-message")
  .setDescription("Set a custom stream notification message")
  .addStringOption((option) =>
    option
      .setName("username")
      .setDescription("Twitch username")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("message")
      .setDescription("Use placeholder like `%s` for streamer name")
      .setRequired(true),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  context: Context,
): Promise<void> {
  const username = interaction.options.getString("username", true);
  const notificationMessage = interaction.options.getString("message", true);

  const { firestore, twitch } = context;

  const streamer = await twitch.getStreamer(username);

  if (!streamer) {
    await interaction.reply({
      content: `❌ Could not find streamer \`${username}\`.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const user = await firestore.getUser(interaction.user.id);
  const canReceiveDM = user?.canReceiveDM || false;

  if (!canReceiveDM) {
    await interaction.reply({
      content: `❌ I can't DM you! Please check your DM settings.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const res = await firestore.setMessage(
    interaction.user.id,
    streamer.id,
    notificationMessage,
  );

  await interaction.reply(
    res.success
      ? `✅ Notification message updated for **${streamer.display_name}**.`
      : `❌ Cannot update message for **${streamer.display_name}**. Reason: ${res.reason}`,
  );
}
