import type { Repositories } from "../../app/container/repositories.js";
import type { DiscordService } from "../../modules/discord/ports/DiscordService.js";
import type { TwitchStreamerProvider } from "../../modules/twitch/ports/TwitchGateway.js";

import { InMemoryUserRepository } from "../repositories/inMemory/InMemoryUserRepository.js";
import { InMemoryAuthUserRepository } from "../repositories/inMemory/InMemoryAuthUserRepository.js";
import { InMemoryStreamerRepository } from "../repositories/inMemory/InMemoryStreamerRepository.js";
import { InMemorySubscriptionRepository } from "../repositories/inMemory/InMemorySubscriptionRepository.js";
import { InMemoryPushSubscriptionRepository } from "../repositories/inMemory/InMemoryPushSubscriptionRepository.js";

export type TestContainer = {
  repositories: Repositories;
  twitch: TwitchStreamerProvider;
  discord: DiscordService;
};

export function createTestContainer(): TestContainer {
  const repositories: Repositories = {
    users: new InMemoryUserRepository(),
    authUsers: new InMemoryAuthUserRepository(),
    streamers: new InMemoryStreamerRepository(),
    subscriptions: new InMemorySubscriptionRepository(),
    pushSubscriptions: new InMemoryPushSubscriptionRepository(),
  };

  const twitch: TwitchStreamerProvider = {
    getStreamer: async () => await Promise.resolve(null),
    fetchStreamers: async () => await Promise.resolve([]),
    searchStreamers: async () =>
      await Promise.resolve([
        {
          id: "streamer-1",
          login: "streamer",
          display_name: "Streamer",
          profile_image_url: "https://example.com/avatar.png",
        },
      ]),
  };

  const discord: DiscordService = {
    isReady: true,
    canSendDirectMessage: async () => await Promise.resolve(true),
  };

  return {
    repositories,
    twitch,
    discord,
  };
}
