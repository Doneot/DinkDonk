export interface TestRepository {
  clear(): void;
}

export type RepositoryFactory<T> = () => T & TestRepository;
