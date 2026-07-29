import { identityRepositoryBehavior } from "../contracts/IdentityRepository.behavior.js";
import { InMemoryIdentityRepository } from "./InMemoryIdentityRepository.js";

identityRepositoryBehavior(
  "InMemoryIdentityRepository",
  () => new InMemoryIdentityRepository(),
);
