import { MessageFlags } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

import type { User } from "../../modules/users/domain/User.js";
import type { CommandContext } from "../../modules/discord/domain/CommandContext.js";

/**
 * Every reply here is ephemeral, error or success: subscriptions and their
 * custom messages are personal, so nothing about them should be broadcast to
 * the channel a slash command happened to be run in.
 */
export function replyEphemeral(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<unknown> {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

/**
 * A raw Discord snowflake is NOT the same as this app's canonical uid for
 * any account that linked Discord as a secondary provider (Google/Twitch
 * primary), so every command that reads or writes a user's data must resolve
 * through here rather than using interaction.user.id directly as a
 * UserRepository/SubscriptionRepository key.
 */
export async function resolveUid(
  interaction: ChatInputCommandInteraction,
  identityRepository: CommandContext["identityRepository"],
): Promise<string | null> {
  const identity = await identityRepository.getIdentityByDiscordUid(
    interaction.user.id,
  );

  if (!identity) {
    await replyEphemeral(
      interaction,
      "❌ I don't recognize this Discord account yet. Please sign in on the website and link Discord first.",
    );

    return null;
  }

  return identity.uid;
}

/**
 * Shared by every subscription-related command: they all only make sense for
 * a user Discord can actually DM. Replies ephemerally and returns null when
 * it can't, so callers can bail out with `if (!resolved) return;`.
 */
export async function requireDMCapableUser(
  interaction: ChatInputCommandInteraction,
  context: Pick<CommandContext, "userRepository" | "identityRepository">,
): Promise<{ user: User; uid: string } | null> {
  const uid = await resolveUid(interaction, context.identityRepository);

  if (!uid) {
    return null;
  }

  const user = await context.userRepository.getUser(uid);

  if (!user?.canReceiveDM) {
    await replyEphemeral(
      interaction,
      "❌ I can't DM you! Please check your DM settings.",
    );

    return null;
  }

  return { user, uid };
}
