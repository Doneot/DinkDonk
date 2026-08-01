import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../modules/discord/domain/CommandContext.js";
import {
  describeReason,
  replyEphemeral,
  requireDMCapableUser,
  resolveStreamerOrReply,
} from "./shared/commandReplies.js";

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
      .setMaxLength(500)
      .setRequired(true),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  const username = interaction.options.getString("username", true);
  const notificationMessage = interaction.options.getString("message", true);

  const { userRepository, twitch } = context;

  const streamer = await resolveStreamerOrReply(interaction, twitch, username);

  if (!streamer) {
    return;
  }

  const resolved = await requireDMCapableUser(interaction, context);

  if (!resolved) {
    return;
  }

  const res = await userRepository.updateSubscription(
    resolved.uid,
    streamer.id,
    { notification_message: notificationMessage },
  );

  await replyEphemeral(
    interaction,
    res.success
      ? `✅ Notification message updated for **${streamer.display_name}**.`
      : `❌ Cannot update message for **${streamer.display_name}**. ${describeReason(res.reason)}`,
  );
}
