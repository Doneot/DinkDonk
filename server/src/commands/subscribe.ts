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
      .setMaxLength(500)
      .setRequired(false),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  const username = interaction.options.getString("username", true);

  const notificationMessage = interaction.options.getString("message");

  const { userRepository, twitch } = context;

  const streamer = await resolveStreamerOrReply(interaction, twitch, username);

  if (!streamer) {
    return;
  }

  const resolved = await requireDMCapableUser(interaction, context);

  if (!resolved) {
    return;
  }

  const res = await userRepository.subscribe(
    resolved.uid,
    streamer.id,
    notificationMessage || undefined,
  );

  await replyEphemeral(
    interaction,
    res.success
      ? `✅ Subscribed to **${streamer.display_name}**!`
      : `❌ Cannot subscribe to **${streamer.display_name}**. ${describeReason(res.reason)}`,
  );
}
