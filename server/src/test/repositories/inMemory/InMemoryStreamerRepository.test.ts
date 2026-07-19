import { streamerRepositoryBehavior } from "../contracts/StreamerRepository.behavior.js";
import { InMemoryStreamerRepository } from "./InMemoryStreamerRepository.js";

streamerRepositoryBehavior(
  "InMemoryStreamerRepository",
  () => new InMemoryStreamerRepository(),
);
