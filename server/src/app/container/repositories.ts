import { FirestoreUserRepository } from "../../modules/users/infrastructure/firestore/FirestoreUserRepository.js";
import { FirestoreIdentityRepository } from "../../modules/auth/infrastructure/firestore/FirestoreIdentityRepository.js";
import { FirestoreStreamerRepository } from "../../modules/streamers/infrastructure/firestore/FirestoreStreamerRepository.js";
import { FirestorePushSubscriptionRepository } from "../../modules/notifications/infrastructure/firestore/FirestorePushSubscriptionRepository.js";

import type { UserRepository } from "../../modules/users/ports/UserRepository.js";
import type { IdentityRepository } from "../../modules/auth/ports/IdentityRepository.js";
import type { StreamerRepository } from "../../modules/streamers/ports/StreamerRepository.js";
import type { PushSubscriptionRepository } from "../../modules/notifications/ports/PushSubscriptionRepository.js";
import { createDomainEventBus } from "../../shared/events/DomainEventBus.js";
import { logger } from "../../shared/logger/logger.js";

export interface Repositories {
  users: UserRepository;
  identities: IdentityRepository;
  streamers: StreamerRepository;
  pushSubscriptions: PushSubscriptionRepository;
}

export function createRepositories(
  firestore: FirebaseFirestore.Firestore,
): Repositories {
  // Shared so a streamer created via either repository (subscribing a first
  // user via UserRepository.subscribe, or the standalone
  // StreamerRepository.createStreamer test-only capability) is announced
  // through the same event stream.
  const events = createDomainEventBus(logger);

  return {
    users: new FirestoreUserRepository(firestore, events),
    identities: new FirestoreIdentityRepository(firestore),
    streamers: new FirestoreStreamerRepository(firestore, events),
    pushSubscriptions: new FirestorePushSubscriptionRepository(firestore),
  };
}
