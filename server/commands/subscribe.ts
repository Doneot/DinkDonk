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
  context: Context,
): Promise<void> {
  const username = interaction.options.getString("username", true);

  const notificationMessage = interaction.options.getString("message");

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

  const res = await firestore.subscribe(
    interaction.user.id,
    streamer.id,
    notificationMessage,
  );

  await interaction.reply(
    res.success
      ? `✅ Subscribed to **${streamer.display_name}**!`
      : `❌ Cannot subscribe to **${streamer.display_name}**. Reason: ${res.reason}`,
  );
}
