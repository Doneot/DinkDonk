import { describe, expect, it, vi } from "vitest";

import { userRepositoryBehavior } from "../contracts/UserRepository.behavior.js";
import { InMemoryUserRepository } from "./InMemoryUserRepository.js";

userRepositoryBehavior(
  "InMemoryUserRepository",
  () => new InMemoryUserRepository(),
);

describe("InMemoryUserRepository.watchUsers", () => {
  it("notifies watchers when an existing user is updated", async () => {
    const repository = new InMemoryUserRepository();

    repository.seed({ id: "user-1", canReceiveDM: false, subscriptions: [] });

    const onChange = vi.fn();

    repository.watchUsers(onChange, vi.fn());

    await repository.updateUser("user-1", { canReceiveDM: true });

    expect(onChange).toHaveBeenCalledWith({
      id: "user-1",
      canReceiveDM: true,
      subscriptions: [],
    });
  });

  it("does not notify watchers when a new user is created via updateUser", async () => {
    const repository = new InMemoryUserRepository();

    const onChange = vi.fn();

    repository.watchUsers(onChange, vi.fn());

    await repository.updateUser("user-1", { canReceiveDM: true });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribing", async () => {
    const repository = new InMemoryUserRepository();

    repository.seed({ id: "user-1", canReceiveDM: false, subscriptions: [] });

    const onChange = vi.fn();

    const unsubscribe = repository.watchUsers(onChange, vi.fn());

    unsubscribe();

    await repository.updateUser("user-1", { canReceiveDM: true });

    expect(onChange).not.toHaveBeenCalled();
  });
});
