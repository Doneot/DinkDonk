import { describe, expect, it, vi } from "vitest";

import { MAX_SUBSCRIPTIONS } from "../../../modules/users/domain/Subscription.js";
import type { Subscription } from "../../../modules/users/domain/Subscription.js";
import type { User } from "../../../modules/users/domain/User.js";
import type { UserRepository } from "../../../modules/users/ports/UserRepository.js";
import { buildSubscription } from "../../builders/subscription.js";
import { buildUser } from "../../builders/user.js";
import type { SeededRepositoryFactory } from "./SeededRepository.js";

export function userRepositoryBehavior(
  name: string,
  createRepository: SeededRepositoryFactory<UserRepository, [User]>,
): void {
  describe(name, () => {
    it("starts empty", async () => {
      const repository = createRepository();

      await expect(repository.getUsers()).resolves.toEqual([]);
      await expect(repository.getUser("missing")).resolves.toBeNull();
    });

    it("returns a seeded user", async () => {
      const repository = createRepository();

      const user = buildUser();

      repository.seed(user);

      await expect(repository.getUser(user.id)).resolves.toEqual(user);
    });

    it("returns all users", async () => {
      const repository = createRepository();

      const user1 = buildUser({
        id: "user-1",
      });

      const user2 = buildUser({
        id: "user-2",
      });

      repository.seed(user1);
      repository.seed(user2);

      await expect(repository.getUsers()).resolves.toEqual([user1, user2]);
    });

    it("returns the requested subset of users, skipping unknown ids", async () => {
      const repository = createRepository();

      const user1 = buildUser({ id: "user-1" });
      const user2 = buildUser({ id: "user-2" });

      repository.seed(user1);
      repository.seed(user2);
      repository.seed(buildUser({ id: "user-3" }));

      await expect(
        repository.getUsersByIds(["user-1", "missing", "user-2"]),
      ).resolves.toEqual([user1, user2]);
    });

    it("returns an empty array for an empty id list", async () => {
      const repository = createRepository();

      repository.seed(buildUser({ id: "user-1" }));

      await expect(repository.getUsersByIds([])).resolves.toEqual([]);
    });

    it("updates an existing user", async () => {
      const repository = createRepository();

      const user = buildUser();

      repository.seed(user);

      await repository.updateUser(user.id, {
        canReceiveDM: false,
      });

      await expect(repository.getUser(user.id)).resolves.toEqual({
        ...user,
        canReceiveDM: false,
      });
    });

    it("creates a user when updating a missing one", async () => {
      const repository = createRepository();

      await repository.updateUser("user-1", {
        canReceiveDM: true,
      });

      await expect(repository.getUser("user-1")).resolves.toEqual({
        id: "user-1",
        canReceiveDM: true,
        subscriptions: [],
        notificationPreferences: {},
      });
    });

    it("throws for an invalid user id", async () => {
      const repository = createRepository();

      await expect(repository.updateUser("", {})).rejects.toThrow(
        "Invalid user id",
      );
    });

    it("rejects updating a user with more subscriptions than the schema allows", async () => {
      const repository = createRepository();

      repository.seed(buildUser({ id: "user-1" }));

      const subscriptions = Array.from(
        { length: MAX_SUBSCRIPTIONS + 1 },
        (_, i) => buildSubscription({ id: `streamer-${i}` }),
      );

      await expect(
        repository.updateUser("user-1", { subscriptions }),
      ).rejects.toThrow();
    });

    it("clear removes every user", async () => {
      const repository = createRepository();

      repository.seed(buildUser());

      repository.clear();

      await expect(repository.getUsers()).resolves.toEqual([]);
    });

    it("counts only users with canReceiveDM=true", async () => {
      const repository = createRepository();

      repository.seed(buildUser({ id: "user-1", canReceiveDM: true }));
      repository.seed(buildUser({ id: "user-2", canReceiveDM: false }));
      repository.seed(buildUser({ id: "user-3", canReceiveDM: true }));

      await expect(repository.countUsersReceivingDM()).resolves.toBe(2);
    });

    describe("subscriptions", () => {
      it("starts with no subscription", async () => {
        const repository = createRepository();

        await expect(
          repository.getSubscription("user-1", "streamer-1"),
        ).resolves.toBeNull();
      });

      it("subscribes a user", async () => {
        const repository = createRepository();

        await expect(
          repository.subscribe("user-1", "streamer-1"),
        ).resolves.toEqual({
          success: true,
          createdStreamer: true,
        });

        await expect(
          repository.getSubscription("user-1", "streamer-1"),
        ).resolves.toEqual({
          id: "streamer-1",
          notification_message: "",
        });
      });

      it("stores the notification message", async () => {
        const repository = createRepository();

        await repository.subscribe("user-1", "streamer-1", "hello");

        await expect(
          repository.getSubscription("user-1", "streamer-1"),
        ).resolves.toEqual({
          id: "streamer-1",
          notification_message: "hello",
        });
      });

      it("rejects duplicate subscriptions", async () => {
        const repository = createRepository();

        await repository.subscribe("user-1", "streamer-1");

        await expect(
          repository.subscribe("user-1", "streamer-1"),
        ).resolves.toEqual({
          success: false,
          reason: "already_subscribed",
        });
      });

      it("rejects subscribing once the subscription limit is reached", async () => {
        const repository = createRepository();
        const subscriptions = Array.from({ length: MAX_SUBSCRIPTIONS }, (_, i) =>
          buildSubscription({ id: `streamer-${i}` }),
        );

        repository.seed(buildUser({ id: "user-1", subscriptions }));

        await expect(
          repository.subscribe("user-1", "one-too-many"),
        ).resolves.toEqual({
          success: false,
          reason: "subscription_limit_reached",
        });
      });

      it("updates a subscription", async () => {
        const repository = createRepository();

        repository.seed(
          buildUser({
            id: "user-1",
            subscriptions: [buildSubscription({ id: "streamer-1" })],
          }),
        );

        await expect(
          repository.updateSubscription("user-1", "streamer-1", {
            notification_message: "updated",
          }),
        ).resolves.toEqual({
          success: true,
        });

        await expect(
          repository.getSubscription("user-1", "streamer-1"),
        ).resolves.toEqual({
          id: "streamer-1",
          notification_message: "updated",
        });
      });

      it("ignores a smuggled id in the update patch, rather than letting it desync the subscription from its subscriber records", async () => {
        const repository = createRepository();

        repository.seed(
          buildUser({
            id: "user-1",
            subscriptions: [buildSubscription({ id: "streamer-1" })],
          }),
        );

        await expect(
          repository.updateSubscription("user-1", "streamer-1", {
            notification_message: "updated",
            id: "streamer-2",
          } as Partial<Omit<Subscription, "id">>),
        ).resolves.toEqual({ success: true });

        await expect(
          repository.getSubscription("user-1", "streamer-1"),
        ).resolves.toEqual({
          id: "streamer-1",
          notification_message: "updated",
        });

        await expect(
          repository.getSubscription("user-1", "streamer-2"),
        ).resolves.toBeNull();
      });

      it("returns subscription_not_found when updating a missing subscription", async () => {
        const repository = createRepository();

        repository.seed(buildUser({ id: "user-1", subscriptions: [] }));

        await expect(
          repository.updateSubscription("user-1", "missing", {}),
        ).resolves.toEqual({
          success: false,
          reason: "subscription_not_found",
        });
      });

      it("returns user_not_found when updating an unknown user", async () => {
        const repository = createRepository();

        await expect(
          repository.updateSubscription("missing", "streamer-1", {}),
        ).resolves.toEqual({
          success: false,
          reason: "user_not_found",
        });
      });

      it("returns invalid_input when updating with a blank user or streamer id", async () => {
        const repository = createRepository();

        await expect(
          repository.updateSubscription("", "streamer-1", {}),
        ).resolves.toEqual({
          success: false,
          reason: "invalid_input",
        });

        await expect(
          repository.updateSubscription("user-1", "", {}),
        ).resolves.toEqual({
          success: false,
          reason: "invalid_input",
        });
      });

      it("unsubscribes a user", async () => {
        const repository = createRepository();

        repository.seed(
          buildUser({
            id: "user-1",
            subscriptions: [buildSubscription({ id: "streamer-1" })],
          }),
        );

        await expect(
          repository.unsubscribe("user-1", "streamer-1"),
        ).resolves.toEqual({
          success: true,
          usersLeft: 0,
        });

        await expect(
          repository.getSubscription("user-1", "streamer-1"),
        ).resolves.toBeNull();
      });

      it("returns user_not_found when unsubscribing an unknown user", async () => {
        const repository = createRepository();

        await expect(
          repository.unsubscribe("missing", "streamer-1"),
        ).resolves.toEqual({
          success: false,
          reason: "user_not_found",
        });
      });

      it("returns not_subscribed when unsubscribing from a streamer the user was never subscribed to", async () => {
        const repository = createRepository();

        // The user exists (has at least one subscription), just not to this
        // streamer - distinct from "user_not_found" above.
        await repository.subscribe("user-1", "streamer-other");

        await expect(
          repository.unsubscribe("user-1", "streamer-1"),
        ).resolves.toEqual({
          success: false,
          reason: "not_subscribed",
        });
      });

      it("rejects subscribing with a notification message over the schema's length limit", async () => {
        const repository = createRepository();

        await expect(
          repository.subscribe("user-1", "streamer-1", "x".repeat(501)),
        ).rejects.toThrow();

        // The rejected write must not have partially persisted.
        await expect(
          repository.getSubscription("user-1", "streamer-1"),
        ).resolves.toBeNull();
      });

      it("rejects updating a subscription with a notification message over the schema's length limit", async () => {
        const repository = createRepository();

        repository.seed(
          buildUser({
            id: "user-1",
            subscriptions: [
              buildSubscription({ id: "streamer-1", notification_message: "ok" }),
            ],
          }),
        );

        await expect(
          repository.updateSubscription("user-1", "streamer-1", {
            notification_message: "x".repeat(501),
          }),
        ).rejects.toThrow();

        // The prior valid value must survive the rejected write.
        await expect(
          repository.getSubscription("user-1", "streamer-1"),
        ).resolves.toEqual({
          id: "streamer-1",
          notification_message: "ok",
        });
      });

      it("emits streamerAdded", async () => {
        const repository = createRepository();

        const listener = vi.fn();

        repository.events.on("streamerAdded", listener);

        await repository.subscribe("user-1", "streamer-1");

        expect(listener).toHaveBeenCalledWith({
          type: "streamerAdded",
          streamerId: "streamer-1",
        });
      });

      it("re-emits streamerAdded when subscribing to a streamer whose doc already exists from a prior, now-empty subscription", async () => {
        // Regression test: the streamer doc persists after its last
        // subscriber unsubscribes (nothing deletes it), so a second user
        // subscribing later can't tell from doc-existence alone whether an
        // EventSub subscription is still actually active for it. Gating the
        // emit on createdStreamer previously meant this case silently
        // skipped recreating the subscription.
        const repository = createRepository();

        await repository.subscribe("user-1", "streamer-1");
        await repository.unsubscribe("user-1", "streamer-1");

        const listener = vi.fn();

        repository.events.on("streamerAdded", listener);

        await repository.subscribe("user-2", "streamer-1");

        expect(listener).toHaveBeenCalledWith({
          type: "streamerAdded",
          streamerId: "streamer-1",
        });
      });

      it("emits streamerEmpty", async () => {
        const repository = createRepository();

        repository.seed(
          buildUser({
            id: "user-1",
            subscriptions: [buildSubscription({ id: "streamer-1" })],
          }),
        );

        const listener = vi.fn();

        repository.events.on("streamerEmpty", listener);

        await repository.unsubscribe("user-1", "streamer-1");

        expect(listener).toHaveBeenCalledWith({
          type: "streamerEmpty",
          streamerId: "streamer-1",
        });
      });

      it("clear removes every subscription", async () => {
        const repository = createRepository();

        repository.seed(
          buildUser({ id: "user-1", subscriptions: [buildSubscription()] }),
        );

        repository.clear();

        await expect(
          repository.getSubscription("user-1", "streamer-1"),
        ).resolves.toBeNull();
      });
    });
  });
}
