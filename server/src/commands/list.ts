import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../modules/discord/domain/CommandContext.js";
import { replyEphemeral, requireDMCapableUser } from "./shared/commandReplies.js";

export const data = new SlashCommandBuilder()
  .setName("list")
  .setDescription("List all subscriptions to notifications you have");

export async function execute(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  const { userRepository, twitch } = context;

  const user = await requireDMCapableUser(interaction, userRepository);

  if (!user) {
    return;
  }

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
