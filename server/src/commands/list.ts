import type { ChatInputCommandInteraction } from "discord.js";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../modules/discord/domain/CommandContext.js";
import { replyEphemeral, requireDMCapableUser } from "./shared/commandReplies.js";

export const data = new SlashCommandBuilder()
  .setName("list")
  .setDescription("List all subscriptions to notifications you have");

export async function execute(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  // Twitch/Firestore calls below can exceed Discord's ~3s initial-ack
  // window; deferring immediately buys up to 15 minutes to actually reply
  // via replyEphemeral (which edits this deferred reply) instead.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { twitch } = context;

  const resolved = await requireDMCapableUser(interaction, context);

  if (!resolved) {
    return;
  }

  const { user } = resolved;

  if (!user.subscriptions.length) {
    await replyEphemeral(interaction, "📭 You have no subscriptions yet.");
    return;
  }

  const streamers = await twitch.fetchStreamers(
    user.subscriptions.map((s) => s.id),
  );

  const list = streamers.map((s) => s.display_name).join("\n");
  await replyEphemeral(interaction, `📺 Subscribed streamers:\n${list}`);
}
