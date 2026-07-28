import { describe, expect, it, vi } from "vitest";

import type { SubscriptionRepository } from "../../../modules/subscriptions/ports/SubscriptionRepository.js";
import { buildSubscription } from "../../builders/subscription.js";

import type { SeededRepositoryFactory } from "./SeededRepository.js";
import type { Subscription } from "../../../modules/subscriptions/domain/Subscription.js";

export function subscriptionRepositoryBehavior(
  name: string,
  createRepository: SeededRepositoryFactory<
    SubscriptionRepository,
    [string, Subscription]
  >,
): void {
  describe(name, () => {
    it("starts empty", async () => {
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

    it("updates a subscription", async () => {
      const repository = createRepository();

      repository.seed(
        "user-1",
        buildSubscription({
          id: "streamer-1",
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

    it("returns subscription_not_found when updating a missing subscription", async () => {
      const repository = createRepository();

      repository.seed("user-1", { id: "", notification_message: "" });

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

    it("unsubscribes a user", async () => {
      const repository = createRepository();

      repository.seed(
        "user-1",
        buildSubscription({
          id: "streamer-1",
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

    it("emits streamerEmpty", async () => {
      const repository = createRepository();

      repository.seed(
        "user-1",
        buildSubscription({
          id: "streamer-1",
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

      repository.seed("user-1", buildSubscription());

      repository.clear();

      await expect(
        repository.getSubscription("user-1", "streamer-1"),
      ).resolves.toBeNull();
    });
  });
}
