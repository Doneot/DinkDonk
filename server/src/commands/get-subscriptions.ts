import { Buffer } from "node:buffer";

import type { ChatInputCommandInteraction } from "discord.js";
import {
  SlashCommandBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import type { CommandContext } from "../modules/discord/domain/CommandContext.js";

export const data = new SlashCommandBuilder()
  .setName("get-subscriptions")
  .setDescription("Get all eventsub subscription")
  // Enforced server-side by Discord (not just hidden client-side), so this
  // cannot be bypassed the way a password argument visible in the invocation
  // could be.
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  const { twitch } = context;

  const res = await twitch.getEventSubSubscriptions();

  if (res.length === 0) {
    await interaction.reply({
      content: "No current subscription",
      flags: MessageFlags.Ephemeral,
    });
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
    flags: MessageFlags.Ephemeral,
  });
}
