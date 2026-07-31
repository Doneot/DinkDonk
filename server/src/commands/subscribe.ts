import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../modules/discord/domain/CommandContext.js";
import { replyEphemeral, requireDMCapableUser } from "./shared/commandReplies.js";

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

  const res = await subscriptionRepository.subscribe(
    resolved.uid,
    streamer.id,
    notificationMessage || undefined,
  );

  await replyEphemeral(
    interaction,
    res.success
      ? `✅ Subscribed to **${streamer.display_name}**!`
      : `❌ Cannot subscribe to **${streamer.display_name}**. Reason: ${res.reason}`,
  );
}
