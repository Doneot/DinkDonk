import { MessageFlags } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

import type { User } from "../../modules/users/domain/User.js";
import type { UserRepository } from "../../modules/users/ports/UserRepository.js";

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
 * Shared by every subscription-related command: they all only make sense for
 * a user Discord can actually DM. Replies ephemerally and returns null when
 * it can't, so callers can bail out with `if (!user) return;`.
 */
export async function requireDMCapableUser(
  interaction: ChatInputCommandInteraction,
  userRepository: UserRepository,
): Promise<User | null> {
  const user = await userRepository.getUser(interaction.user.id);

  if (!user?.canReceiveDM) {
    await replyEphemeral(
      interaction,
      "❌ I can't DM you! Please check your DM settings.",
    );

    return null;
  }

  return user;
}
