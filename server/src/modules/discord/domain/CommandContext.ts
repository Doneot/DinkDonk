import type { TwitchClient } from "../../twitch/infrastructure/TwitchClient.js";

import type { UserRepository } from "../../users/ports/UserRepository.js";
import type { IdentityRepository } from "../../auth/ports/IdentityRepository.js";
import type { StreamerRepository } from "../../streamers/ports/StreamerRepository.js";
import type { SubscriptionRepository } from "../../subscriptions/ports/SubscriptionRepository.js";
import type { DiscordBot } from "../infrastructure/DiscordBot.js";

export type CommandContext = {
  twitch: TwitchClient;

  userRepository: UserRepository;

  // Resolves a raw Discord snowflake to the account's canonical uid, which
  // is NOT the same value for any account that linked Discord as a
  // secondary provider (see IdentityRepository.getIdentityByDiscordUid) -
  // commands must resolve through this rather than using
  // interaction.user.id directly as a UserRepository/SubscriptionRepository
  // key.
  identityRepository: IdentityRepository;

  streamerRepository: StreamerRepository;

  subscriptionRepository: SubscriptionRepository;

  discord?: DiscordBot;
};
