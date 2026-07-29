import type { Repositories } from "../../app/container/repositories.js";
import type { DiscordService } from "../../modules/discord/ports/DiscordService.js";
import type { TwitchStreamerProvider } from "../../modules/twitch/ports/TwitchGateway.js";
import { createDomainEventBus } from "../../shared/events/DomainEventBus.js";
import { logger } from "../../shared/logger/logger.js";

import { InMemoryIdentityRepository } from "../repositories/inMemory/InMemoryIdentityRepository.js";
import { InMemoryPushSubscriptionRepository } from "../repositories/inMemory/InMemoryPushSubscriptionRepository.js";
import { InMemoryStreamerRepository } from "../repositories/inMemory/InMemoryStreamerRepository.js";
import { InMemorySubscriberStore } from "../repositories/inMemory/InMemorySubscriberStore.js";
import { InMemorySubscriptionRepository } from "../repositories/inMemory/InMemorySubscriptionRepository.js";
import { InMemoryUserRepository } from "../repositories/inMemory/InMemoryUserRepository.js";

export type TestContainer = {
  repositories: Repositories;
  twitch: TwitchStreamerProvider;
  discord: DiscordService;
};

export function createTestContainer(): TestContainer {
  // Mirrors production wiring (createRepositories): the streamer and
  // subscription repositories share one event bus and one view of "who's
  // subscribed to this streamer", the same way both Firestore repositories
  // share one event bus and the same `streamers/{id}/subscribers`
  // subcollection.
  const events = createDomainEventBus(logger);
  const subscribers = new InMemorySubscriberStore();

  const repositories: Repositories = {
    users: new InMemoryUserRepository(),
    identities: new InMemoryIdentityRepository(),
    streamers: new InMemoryStreamerRepository(events, subscribers),
    subscriptions: new InMemorySubscriptionRepository(events, subscribers),
    pushSubscriptions: new InMemoryPushSubscriptionRepository(),
  };

  const twitch: TwitchStreamerProvider = {
    getStreamer: async () => Promise.resolve(null),

    fetchStreamers: async () => Promise.resolve([]),

    searchStreamers: async () =>
      Promise.resolve([
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

    canSendDirectMessage: async () => Promise.resolve(true),
  };

  return {
    repositories,
    twitch,
    discord,
  };
}
