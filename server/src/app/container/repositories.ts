import { FirestoreUserRepository } from "../../modules/users/infrastructure/firestore/FirestoreUserRepository.js";
import { FirestoreAuthUserRepository } from "../../modules/auth/infrastructure/firestore/FirestoreAuthUserRepository.js";
import { FirestoreStreamerRepository } from "../../modules/streamers/infrastructure/firestore/FirestoreStreamerRepository.js";
import { FirestoreSubscriptionRepository } from "../../modules/subscriptions/infrastructure/firestore/FirestoreSubscriptionRepository.js";
import { FirestorePushSubscriptionRepository } from "../../modules/notifications/infrastructure/firestore/FirestorePushSubscriptionRepository.js";

import type { UserRepository } from "../../modules/users/ports/UserRepository.js";
import type { AuthUserRepository } from "../../modules/auth/ports/AuthUserRepository.js";
import type { StreamerRepository } from "../../modules/streamers/ports/StreamerRepository.js";
import type { SubscriptionRepository } from "../../modules/subscriptions/ports/SubscriptionRepository.js";
import type { PushSubscriptionRepository } from "../../modules/notifications/ports/PushSubscriptionRepository.js";
import { createDomainEventBus } from "../../shared/events/DomainEventBus.js";
import { logger } from "../../shared/logger/logger.js";

export interface Repositories {
  users: UserRepository;
  authUsers: AuthUserRepository;
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
    authUsers: new FirestoreAuthUserRepository(firestore),
    streamers: new FirestoreStreamerRepository(firestore, events),
    subscriptions: new FirestoreSubscriptionRepository(firestore, events),
    pushSubscriptions: new FirestorePushSubscriptionRepository(firestore),
  };
}
