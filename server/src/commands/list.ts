import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { CommandContext } from "../modules/discord/domain/CommandContext.js";

export const data = new SlashCommandBuilder()
  .setName("list")
  .setDescription("List all subscriptions to notifications you have");

export async function execute(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  const { userRepository, twitch } = context;

  const user = await userRepository.getUser(interaction.user.id);

  const canReceiveDM = user?.canReceiveDM || false;

  if (!canReceiveDM) {
    await interaction.reply({
      content: `❌ I can't DM you! Please check your DM settings.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!user?.subscriptions?.length) {
    await interaction.reply("📭 You have no subscriptions yet.");
    return;
  }

  const streamers = await twitch.fetchStreamers(
    user.subscriptions.map((s) => s.id),
  );

  const list = streamers.map((s) => s.display_name).join("\n");
  await interaction.reply(`📺 Subscribed streamers:\n${list}`);
}
