import type { TwitchClient } from "../../twitch/infrastructure/TwitchClient.js";

import type { UserRepository } from "../../users/ports/UserRepository.js";
import type { StreamerRepository } from "../../streamers/ports/StreamerRepository.js";
import type { SubscriptionRepository } from "../../subscriptions/ports/SubscriptionRepository.js";
import type { DiscordBot } from "../infrastructure/DiscordBot.js";

export type CommandContext = {
  twitch: TwitchClient;

  userRepository: UserRepository;

  streamerRepository: StreamerRepository;

  subscriptionRepository: SubscriptionRepository;

  discord?: DiscordBot;
};
