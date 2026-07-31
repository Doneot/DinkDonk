import path from "node:path";
import { fileURLToPath } from "node:url";

import { TwitchProvider } from "../../modules/twitch/application/TwitchProvider.js";
import { DiscordBot } from "../../modules/discord/infrastructure/DiscordBot.js";

import { env } from "../../shared/config/env.js";
import { assertDefined } from "../../shared/utils/assert.js";

import { TwitchClient } from "../../modules/twitch/infrastructure/TwitchClient.js";

import type { Repositories } from "./repositories.js";
import type { UserRepository } from "../../modules/users/ports/UserRepository.js";
import type { IdentityRepository } from "../../modules/auth/ports/IdentityRepository.js";
import type { StreamerRepository } from "../../modules/streamers/ports/StreamerRepository.js";
import type { SubscriptionRepository } from "../../modules/subscriptions/ports/SubscriptionRepository.js";
import type { Runtime } from "../runtime/Runtime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createProviders(repositories: Repositories, runtime: Runtime) {
  const twitch = new TwitchProvider({
    client: new TwitchClient({ publicUrl: runtime.publicUrl }),
  });

  const context: {
    twitch: TwitchClient;
    userRepository: UserRepository;
    identityRepository: IdentityRepository;
    streamerRepository: StreamerRepository;
    subscriptionRepository: SubscriptionRepository;
  } = {
    twitch: twitch.client,
    userRepository: repositories.users,
    identityRepository: repositories.identities,
    streamerRepository: repositories.streamers,
    subscriptionRepository: repositories.subscriptions,
  };

  const discord = new DiscordBot({
    token: assertDefined(env.discord.token, "Discord token"),

    commandDirectory: path.join(__dirname, "../../commands"),

    context,

    onDmCapabilityChanged: (userId, canReceiveDM) =>
      repositories.users.updateUser(userId, { canReceiveDM }),
  });

  return {
    twitch,
    discord,
  };
}
