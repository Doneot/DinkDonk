import { pushSubscriptionRepositoryBehavior } from "../contracts/PushSubscriptionRepository.behavior.js";
import { InMemoryPushSubscriptionRepository } from "./InMemoryPushSubscriptionRepository.js";

pushSubscriptionRepositoryBehavior(
  "InMemoryPushSubscriptionRepository",
  () => new InMemoryPushSubscriptionRepository(),
);
