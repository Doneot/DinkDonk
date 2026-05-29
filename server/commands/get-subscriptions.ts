import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { env } from "../src/config/env.js";
import type { TwitchSubscriptionService } from "../src/types/services/twitch.js";

type Context = {
  twitch: TwitchSubscriptionService;
};

export const data = new SlashCommandBuilder()
  .setName("get-subscriptions")
  .setDescription("Get all eventsub subscription")
  .addStringOption((option) =>
    option
      .setName("password")
      .setDescription("Admin password required to run this cmd")
      .setRequired(true),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  context: Context,
): Promise<void> {
  const password = interaction.options.getString("password");
  const { twitch } = context;

  if (password !== env.adminPassword) {
    await interaction.reply("❌ Wrong password, you cannot use this command");
    return;
  }

  const res = await twitch.getSubscriptions();

  if (res.length === 0) {
    await interaction.reply("No current subscription");
    return;
  }

  const file = new AttachmentBuilder(
    Buffer.from(JSON.stringify(res, null, 2)),
    {
      name: "subscriptions.json",
    },
  );

  await interaction.reply({
    content: "**Current subscriptions:**",
    files: [file],
  });
}
