import { Buffer } from "node:buffer";

import type { ChatInputCommandInteraction } from "discord.js";
import {
  SlashCommandBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  MessageFlags,
} from "discord.js";

import type { CommandContext } from "../modules/discord/domain/CommandContext.js";

export const data = new SlashCommandBuilder()
  .setName("get-subscriptions")
  .setDescription("Get all EventSub subscriptions")
  // Enforced server-side by Discord (not just hidden client-side), so this
  // cannot be bypassed the way a password argument visible in the invocation
  // could be - but only inside a guild: default_member_permissions checks
  // the invoking member's guild-level role permissions, which don't exist
  // in a DM context, so Discord doesn't enforce it there. Restricting to
  // Guild context explicitly closes that gap rather than relying on the
  // permission check alone.
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild);

export async function execute(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  const { twitch } = context;

  // getEventSubSubscriptions() paginates every EventSub subscription page by
  // page - latency scales with deployment size and can exceed Discord's ~3s
  // initial-ack window. Deferring immediately buys up to 15 minutes to
  // actually reply via editReply below instead.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const res = await twitch.getEventSubSubscriptions();

  if (res.length === 0) {
    await interaction.editReply({
      content: "No current subscription",
    });
    return;
  }

  const file = new AttachmentBuilder(
    Buffer.from(JSON.stringify(res, null, 2)),
    {
      name: "subscriptions.json",
    },
  );

  await interaction.editReply({
    content: "**Current subscriptions:**",
    files: [file],
  });
}
