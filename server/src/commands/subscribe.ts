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
  .setName("subscribe")
  .setDescription("Subscribe to a Twitch streamer")
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
      .setDescription("Custom notification message")
      .setMaxLength(500)
      .setRequired(false),
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
