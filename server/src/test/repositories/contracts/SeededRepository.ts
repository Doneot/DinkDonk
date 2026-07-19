import type { TestRepository } from "./TestRepository.js";

export type SeededRepositoryFactory<T, TArgs extends unknown[]> = () => T &
  TestRepository & {
    seed(...args: TArgs): void;
  };
