import { subscriptionRepositoryBehavior } from "../contracts/SubscriptionRepository.behavior.js";
import { InMemorySubscriptionRepository } from "./InMemorySubscriptionRepository.js";

subscriptionRepositoryBehavior(
  "InMemorySubscriptionRepository",
  () => new InMemorySubscriptionRepository(),
);
