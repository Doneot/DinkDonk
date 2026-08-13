import type { ChatInputCommandInteraction } from "discord.js";
import { MessageFlags, SlashCommandBuilder } from "discord.js";

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
      // Twitch logins are 4-25 characters; bounding this avoids wasting a
      // Twitch API round trip on a value that could never match a real one.
      .setMaxLength(25)
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
  // Twitch/Firestore calls below can exceed Discord's ~3s initial-ack
  // window; deferring immediately buys up to 15 minutes to actually reply
  // via replyEphemeral (which edits this deferred reply) instead.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
