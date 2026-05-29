import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type {
  UserReaderService,
  SubscriptionService,
} from "../src/types/services/firestore.js";
import type { TwitchStreamerService } from "../src/types/services/twitch.js";

type Context = {
  firestore: UserReaderService & SubscriptionService;
  twitch: TwitchStreamerService;
};

export const data = new SlashCommandBuilder()
  .setName("unsubscribe")
  .setDescription("Unsubscribe from a Twitch streamer")
  .addStringOption((option) =>
    option
      .setName("username")
      .setDescription("Twitch username")
      .setRequired(true),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  context: Context,
): Promise<void> {
  const username = interaction.options.getString("username", true);

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

  const res = await firestore.unsubscribe(interaction.user.id, streamer.id);

  await interaction.reply(
    res.success
      ? `✅ Unsubscribed from **${streamer.display_name}**.`
      : `❌ Cannot unsubscribe from **${streamer.display_name}**. Reason: ${res.reason}`,
  );
}
