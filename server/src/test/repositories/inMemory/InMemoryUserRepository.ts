import type { UpdateNotificationPreferenceResult } from "../../../modules/users/domain/NotificationPreferenceResult.js";
import type {
  SubscribeResult,
  UnsubscribeResult,
  UpdateSubscriptionResult,
} from "../../../modules/users/domain/SubscribeResult.js";
import type { Subscription } from "../../../modules/users/domain/Subscription.js";
import { MAX_SUBSCRIPTIONS } from "../../../modules/users/domain/Subscription.js";
import type { User } from "../../../modules/users/domain/User.js";
import type { UserUpdate } from "../../../modules/users/domain/UserUpdate.js";
import { UserUpdateSchema } from "../../../modules/users/infrastructure/firestore/records/UserRecord.js";
import type { UserRepository } from "../../../modules/users/ports/UserRepository.js";
import { SubscriptionSchema } from "../../../modules/users/schemas/SubscriptionSchema.js";
import type { DomainEventBus } from "../../../shared/events/DomainEventBus.js";
import { createDomainEventBus } from "../../../shared/events/DomainEventBus.js";
import { logger } from "../../../shared/logger/logger.js";
import { isNonEmptyString } from "../../../shared/utils/validators.js";
import { InMemorySubscriberStore } from "./InMemorySubscriberStore.js";

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();
  private readonly watchers = new Set<(user: User) => void>();

  constructor(
    readonly events: DomainEventBus = createDomainEventBus(logger),
    private readonly subscribers: InMemorySubscriberStore = new InMemorySubscriberStore(),
  ) {}

  getUser(userId: string): Promise<User | null> {
    return Promise.resolve(structuredClone(this.users.get(userId) ?? null));
  }

  getUsers(): Promise<User[]> {
    return Promise.resolve(
      [...this.users.values()].map((user) => structuredClone(user)),
    );
  }

  getUsersByIds(userIds: string[]): Promise<User[]> {
    return Promise.resolve(
      userIds
        .filter(isNonEmptyString)
        .map((id) => this.users.get(id))
        .filter((user): user is User => user !== undefined)
        .map((user) => structuredClone(user)),
    );
  }

  updateUser(userId: string, data: UserUpdate): Promise<void> {
    if (!isNonEmptyString(userId)) {
      return Promise.reject(new Error("Invalid user id"));
    }

    let validated: UserUpdate;

    try {
      validated = UserUpdateSchema.parse(data) as UserUpdate;
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }

    const existing = this.users.get(userId);
    const isModification = existing !== undefined;

    const updated: User = {
      ...(existing ?? {
        id: userId,
        subscriptions: [],
        canReceiveDM: false,
        notificationPreferences: {},
      }),
      ...validated,
    };

    this.users.set(userId, updated);

    // Mirrors Firestore's "modified" doc-change type: a brand-new document
    // is a creation, not a change to watch, matching
    // FirestoreUserRepository.watchUsers()'s change.type === "modified"
    // filter.
    if (isModification) {
      for (const watcher of this.watchers) {
        watcher(structuredClone(updated));
      }
    }

    return Promise.resolve();
  }

  countUsersReceivingDM(): Promise<number> {
    return Promise.resolve(
      [...this.users.values()].filter((user) => user.canReceiveDM).length,
    );
  }

  watchUsers(
    onChange: (user: User) => void,
    _onError: (error: Error) => void,
  ): () => void {
    this.watchers.add(onChange);

    return () => {
      this.watchers.delete(onChange);
    };
  }

  private ensureUser(userId: string): User {
    let user = this.users.get(userId);

    if (!user) {
      user = {
        id: userId,
        subscriptions: [],
        canReceiveDM: false,
        notificationPreferences: {},
      };
      this.users.set(userId, user);
    }

    return user;
  }

  getSubscription(
    userId: string,
    streamerId: string,
  ): Promise<Subscription | null> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(streamerId)) {
      return Promise.resolve(null);
    }

    const user = this.users.get(userId);

    return Promise.resolve(
      user?.subscriptions.find((s) => s.id === streamerId) ?? null,
    );
  }

  // Wraps the synchronous SubscriptionSchema.parse() throw below into a
  // rejected promise (matching FirestoreUserRepository's behavior) rather
  // than letting it throw out of this call synchronously.
  subscribe(
    userId: string,
    streamerId: string,
    notificationMessage = "",
  ): Promise<SubscribeResult> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(streamerId)) {
      return Promise.resolve({ success: false, reason: "invalid_input" });
    }

    const user = this.ensureUser(userId);

    if (user.subscriptions.some((s) => s.id === streamerId)) {
      return Promise.resolve({ success: false, reason: "already_subscribed" });
    }

    if (user.subscriptions.length >= MAX_SUBSCRIPTIONS) {
      return Promise.resolve({
        success: false,
        reason: "subscription_limit_reached",
      });
    }

    let newSubscription: Subscription;

    try {
      newSubscription = SubscriptionSchema.parse({
        id: streamerId,
        notification_message: notificationMessage,
      });
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }

    user.subscriptions = [...user.subscriptions, newSubscription];

    const createdStreamer = !this.subscribers.has(streamerId);

    this.subscribers.ensure(streamerId).add(userId);

    // Matches FirestoreUserRepository: emitted on every successful
    // subscribe, not just when createdStreamer is true - see its
    // implementation for why doc/entry existence isn't a safe proxy for
    // "has an active subscription."
    this.events.emit({ type: "streamerAdded", streamerId });

    return Promise.resolve({ success: true, createdStreamer });
  }

  unsubscribe(userId: string, streamerId: string): Promise<UnsubscribeResult> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(streamerId)) {
      return Promise.resolve({ success: false, reason: "invalid_input" });
    }

    const user = this.users.get(userId);

    if (!user) {
      return Promise.resolve({ success: false, reason: "user_not_found" });
    }

    if (!user.subscriptions.some((s) => s.id === streamerId)) {
      return Promise.resolve({ success: false, reason: "not_subscribed" });
    }

    user.subscriptions = user.subscriptions.filter((s) => s.id !== streamerId);

    let usersLeft = 0;

    if (this.subscribers.has(streamerId)) {
      const streamerSubscribers = this.subscribers.ensure(streamerId);

      streamerSubscribers.delete(userId);
      usersLeft = streamerSubscribers.size;

      if (usersLeft === 0) {
        this.subscribers.delete(streamerId);
        this.events.emit({ type: "streamerEmpty", streamerId });
      }
    }

    return Promise.resolve({ success: true, usersLeft });
  }

  // Same reason as subscribe() above for avoiding a synchronous throw.
  updateSubscription(
    userId: string,
    streamerId: string,
    data: Partial<Omit<Subscription, "id">>,
  ): Promise<UpdateSubscriptionResult> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(streamerId)) {
      return Promise.resolve({ success: false, reason: "invalid_input" });
    }

    const user = this.users.get(userId);

    if (!user) {
      return Promise.resolve({ success: false, reason: "user_not_found" });
    }

    const existing = user.subscriptions.find((s) => s.id === streamerId);

    if (!existing) {
      return Promise.resolve({
        success: false,
        reason: "subscription_not_found",
      });
    }

    // Defense-in-depth alongside the Partial<Omit<Subscription, "id">> patch
    // type, matching FirestoreUserRepository.updateSubscription: even if a
    // caller's `data` were cast/widened to smuggle an `id` through, it's
    // stripped here so it can't override the entry being updated and
    // desync it from the `subscribers` store below (which stays keyed by
    // the original id).
    const { id: _ignoredId, ...patch } = data as Partial<Subscription>;

    let updated: Subscription;

    try {
      updated = SubscriptionSchema.parse({ ...existing, ...patch });
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }

    user.subscriptions = user.subscriptions.map((s) =>
      s.id === streamerId ? updated : s,
    );

    return Promise.resolve({ success: true });
  }

  updateNotificationPreference(
    userId: string,
    channel: string,
    enabled: boolean,
  ): Promise<UpdateNotificationPreferenceResult> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(channel)) {
      return Promise.resolve({ success: false, reason: "invalid_input" });
    }

    const user = this.users.get(userId);

    if (!user) {
      return Promise.resolve({ success: false, reason: "user_not_found" });
    }

    user.notificationPreferences = {
      ...(user.notificationPreferences ?? {}),
      [channel]: enabled,
    };

    return Promise.resolve({ success: true });
  }

  seed(user: User): void {
    this.users.set(user.id, structuredClone(user));

    for (const subscription of user.subscriptions) {
      this.subscribers.ensure(subscription.id).add(user.id);
    }
  }

  clear(): void {
    this.users.clear();
  }
}
