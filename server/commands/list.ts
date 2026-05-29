import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { UserReaderService } from "../src/types/services/firestore.js";
import type { TwitchStreamerService } from "../src/types/services/twitch.js";

type Context = {
  firestore: UserReaderService;
  twitch: TwitchStreamerService;
};

export const data = new SlashCommandBuilder()
  .setName("list")
  .setDescription("List all subscriptions to notifications you have");

export async function execute(
  interaction: ChatInputCommandInteraction,
  context: Context,
): Promise<void> {
  const { firestore, twitch } = context;

  const user = await firestore.getUser(interaction.user.id);

  const canReceiveDM = user?.canReceiveDM || false;

  if (!canReceiveDM) {
    await interaction.reply({
      content: `❌ I can't DM you! Please check your DM settings.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!user?.streamers?.length) {
    await interaction.reply("📭 You have no subscriptions yet.");
    return;
  }

  const streamers = await twitch.fetchStreamers(
    user.streamers.map((s) => s.id),
  );

  const list = streamers.map((s) => s.display_name).join("\n");
  await interaction.reply(`📺 Subscribed streamers:\n${list}`);
}
