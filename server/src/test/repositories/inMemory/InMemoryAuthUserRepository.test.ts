import { authUserRepositoryBehavior } from "../contracts/AuthUserRepository.behavior.js";
import { InMemoryAuthUserRepository } from "./InMemoryAuthUserRepository.js";

authUserRepositoryBehavior(
  "InMemoryAuthUserRepository",
  () => new InMemoryAuthUserRepository(),
);
