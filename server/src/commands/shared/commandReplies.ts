import { MessageFlags } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

import type { User } from "../../modules/users/domain/User.js";
import type { SubscribeFailureReason } from "../../modules/users/domain/SubscribeResult.js";
import type { TwitchStreamer } from "../../modules/twitch/domain/Twitch.js";
import type { CommandContext } from "../../modules/discord/domain/CommandContext.js";

/**
 * Every reply here is ephemeral, error or success: subscriptions and their
 * custom messages are personal, so nothing about them should be broadcast to
 * the channel a slash command happened to be run in.
 *
 * Every command that reaches this (via a Firestore/Twitch call somewhere in
 * this chain) has already called interaction.deferReply() as its first line
 * - Discord requires an initial ack within ~3s, well inside what any of
 * those calls can take - so this edits that deferred reply rather than
 * calling reply() again (which would throw: an interaction can only be
 * acked once). Still falls back to a direct ephemeral reply() for a command
 * that has no I/O and genuinely never defers.
 */
export function replyEphemeral(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<unknown> {
  return interaction.deferred || interaction.replied
    ? interaction.editReply({ content })
    : interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

/**
 * A raw Discord snowflake is NOT the same as this app's canonical uid for
 * any account that linked Discord as a secondary provider (Google/Twitch
 * primary), so every command that reads or writes a user's data must resolve
 * through here rather than using interaction.user.id directly as a
 * UserRepository key.
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
 * Shared by every subscription command: resolves the username option to a
 * real Twitch streamer, replying ephemerally and returning null when Twitch
 * doesn't know it, so callers can bail out with `if (!streamer) return;`.
 */
export async function resolveStreamerOrReply(
  interaction: ChatInputCommandInteraction,
  twitch: Pick<CommandContext["twitch"], "getStreamer">,
  username: string,
): Promise<TwitchStreamer | null> {
  const streamer = await twitch.getStreamer(username);

  if (!streamer) {
    await replyEphemeral(interaction, `❌ Could not find streamer \`${username}\`.`);

    return null;
  }

  return streamer;
}

// Internal SubscribeResult/UnsubscribeResult/UpdateSubscriptionResult reason
// codes, translated to a sentence rather than shown to users verbatim (e.g.
// "Reason: already_subscribed") - keeps the two free to diverge, since a
// reason code is an internal implementation detail while this copy is a
// user-facing contract.
// Typed against SubscribeFailureReason via `satisfies` (rather than
// `Record<SubscribeFailureReason, string>` directly) so this keeps its wider
// `Record<string, string>` declared type below - describeReason() is a
// defensive boundary function meant to tolerate an arbitrary/unrecognized
// reason value gracefully, not just the five currently known ones - while
// still getting a compile error here if a reason code is ever added to
// SubscribeResult/UnsubscribeResult/UpdateSubscriptionResult without a
// corresponding entry.
const REASON_MESSAGES: Record<string, string> = {
  invalid_input: "That wasn't a valid request.",
  already_subscribed: "You're already subscribed to this streamer.",
  subscription_limit_reached:
    "You've reached the maximum number of subscriptions.",
  user_not_found: "I couldn't find your account. Please sign in on the website first.",
  not_subscribed: "You're not subscribed to this streamer.",
  subscription_not_found: "I couldn't find that subscription.",
} satisfies Record<SubscribeFailureReason, string>;

/** Maps a subscription-command result's `reason` code to user-facing copy. */
export function describeReason(reason: string): string {
  return REASON_MESSAGES[reason] ?? "Something went wrong.";
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
