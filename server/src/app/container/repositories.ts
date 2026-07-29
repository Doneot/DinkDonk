import { FirestoreUserRepository } from "../../modules/users/infrastructure/firestore/FirestoreUserRepository.js";
import { FirestoreIdentityRepository } from "../../modules/auth/infrastructure/firestore/FirestoreIdentityRepository.js";
import { FirestoreStreamerRepository } from "../../modules/streamers/infrastructure/firestore/FirestoreStreamerRepository.js";
import { FirestoreSubscriptionRepository } from "../../modules/subscriptions/infrastructure/firestore/FirestoreSubscriptionRepository.js";
import { FirestorePushSubscriptionRepository } from "../../modules/notifications/infrastructure/firestore/FirestorePushSubscriptionRepository.js";

import type { UserRepository } from "../../modules/users/ports/UserRepository.js";
import type { IdentityRepository } from "../../modules/auth/ports/IdentityRepository.js";
import type { StreamerRepository } from "../../modules/streamers/ports/StreamerRepository.js";
import type { SubscriptionRepository } from "../../modules/subscriptions/ports/SubscriptionRepository.js";
import type { PushSubscriptionRepository } from "../../modules/notifications/ports/PushSubscriptionRepository.js";
import { createDomainEventBus } from "../../shared/events/DomainEventBus.js";
import { logger } from "../../shared/logger/logger.js";

export interface Repositories {
  users: UserRepository;
  identities: IdentityRepository;
  streamers: StreamerRepository;
  subscriptions: SubscriptionRepository;
  pushSubscriptions: PushSubscriptionRepository;
}

export function createRepositories(
  firestore: FirebaseFirestore.Firestore,
): Repositories {
  // Shared so a streamer created via either repository (subscribing a first
  // user, or the standalone createStreamer API) is announced through the
  // same event stream.
  const events = createDomainEventBus(logger);

  return {
    users: new FirestoreUserRepository(firestore),
    identities: new FirestoreIdentityRepository(firestore),
    streamers: new FirestoreStreamerRepository(firestore, events),
    subscriptions: new FirestoreSubscriptionRepository(firestore, events),
    pushSubscriptions: new FirestorePushSubscriptionRepository(firestore),
  };
}
