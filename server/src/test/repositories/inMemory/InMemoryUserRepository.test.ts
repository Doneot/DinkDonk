import { userRepositoryBehavior } from "../contracts/UserRepository.behavior.js";
import { InMemoryUserRepository } from "./InMemoryUserRepository.js";

userRepositoryBehavior(
  "InMemoryUserRepository",
  () => new InMemoryUserRepository(),
);
