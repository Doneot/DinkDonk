import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../modules/discord/domain/CommandContext.js";
import { replyEphemeral, requireDMCapableUser } from "./shared/commandReplies.js";

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
  context: CommandContext,
): Promise<void> {
  const username = interaction.options.getString("username", true);

  const { subscriptionRepository, twitch } = context;

  const streamer = await twitch.getStreamer(username);

  if (!streamer) {
    await replyEphemeral(interaction, `❌ Could not find streamer \`${username}\`.`);
    return;
  }

  const resolved = await requireDMCapableUser(interaction, context);

  if (!resolved) {
    return;
  }

  const res = await subscriptionRepository.unsubscribe(
    resolved.uid,
    streamer.id,
  );

  await replyEphemeral(
    interaction,
    res.success
      ? `✅ Unsubscribed from **${streamer.display_name}**.`
      : `❌ Cannot unsubscribe from **${streamer.display_name}**. Reason: ${res.reason}`,
  );
}
