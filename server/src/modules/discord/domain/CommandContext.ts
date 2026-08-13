import type { IdentityRepository } from "../../auth/ports/IdentityRepository.js";
import type { StreamerRepository } from "../../streamers/ports/StreamerRepository.js";
import type {
  TwitchStreamerProvider,
  TwitchSubscriptionProvider,
} from "../../twitch/ports/TwitchGateway.js";
import type { UserRepository } from "../../users/ports/UserRepository.js";

export type CommandContext = {
  twitch: TwitchStreamerProvider & TwitchSubscriptionProvider;

  // Also owns subscribe/unsubscribe/getSubscription/updateSubscription - a
  // Subscription lives embedded in User.subscriptions, not as its own
  // aggregate, so there's no separate SubscriptionRepository to inject.
  userRepository: UserRepository;

  // Resolves a raw Discord snowflake to the account's canonical uid, which
  // is NOT the same value for any account that linked Discord as a
  // secondary provider (see IdentityRepository.getIdentityByDiscordUid) -
  // commands must resolve through this rather than using
  // interaction.user.id directly as a UserRepository key.
  identityRepository: IdentityRepository;

  streamerRepository: StreamerRepository;
};
