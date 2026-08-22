import type { DomainEventBus } from "../../../shared/events/DomainEventBus.js";
import type { UpdateNotificationPreferenceResult } from "../domain/NotificationPreferenceResult.js";
import type {
  SubscribeResult,
  UnsubscribeResult,
  UpdateSubscriptionResult,
} from "../domain/SubscribeResult.js";
import type { Subscription } from "../domain/Subscription.js";
import type { User } from "../domain/User.js";
import type { UserUpdate } from "../domain/UserUpdate.js";

export interface UserRepository {
  /**
   * Emits "streamerAdded"/"streamerEmpty" as subscriptions change (see
   * subscribe/unsubscribe below). A `Subscription` lives embedded in
   * `User.subscriptions`, not as its own aggregate, so this repository owns
   * both - a subscription only ever exists as part of a user.
   *
   * "streamerAdded" fires on every successful subscribe, not just the
   * streamer's first ever subscriber - see subscribe's implementation for
   * why.
   */
  readonly events: DomainEventBus;

  getUser(userId: string): Promise<User | null>;

  /**
   * Currently has zero production callers. `limit` defaults to a sensible
   * cap even when omitted, so this can never accidentally become a truly
   * unbounded collection read once it does get a caller.
   */
  getUsers(limit?: number): Promise<User[]>;

  /**
   * Batched multi-get by id, for callers (e.g. notification fan-out) that
   * already know exactly which users they need rather than wanting a
   * collection scan. Firestore-backed implementations should use a real
   * batched read (Firestore#getAll) instead of one .get() per id.
   */
  getUsersByIds(userIds: string[]): Promise<User[]>;

  updateUser(userId: string, data: UserUpdate): Promise<void>;

  /** Count of users with canReceiveDM=true, without loading every document. */
  countUsersReceivingDM(): Promise<number>;

  /**
   * Subscribes to updates for existing users (creations/deletions aren't
   * reported). A record that fails to parse is skipped and logged by the
   * implementation rather than surfaced here. Returns an unsubscribe
   * function; the caller (e.g. UserChangeBroadcaster) owns any retry policy
   * for onError, which reports the underlying stream dying, not a per-record
   * problem.
   */
  watchUsers(
    onChange: (user: User) => void,
    onError: (error: Error) => void,
  ): () => void;

  getSubscription(
    userId: string,
    streamerId: string,
  ): Promise<Subscription | null>;

  subscribe(
    userId: string,
    streamerId: string,
    notificationMessage?: string | null,
  ): Promise<SubscribeResult>;

  unsubscribe(userId: string, streamerId: string): Promise<UnsubscribeResult>;

  /**
   * `id` is intentionally excluded from the patch type - it's what
   * identifies which subscription is being updated (and is what the
   * `subscribers` subcollection doc is keyed by), so letting a patch
   * silently overwrite it could desynchronize the two.
   */
  updateSubscription(
    userId: string,
    streamerId: string,
    data: Partial<Omit<Subscription, "id">>,
  ): Promise<UpdateSubscriptionResult>;

  /**
   * Sets a single channel's opt-in/opt-out preference (keyed by
   * NotificationChannel.name), leaving every other channel's preference
   * untouched - a read-modify-write of the whole map rather than a blanket
   * `updateUser` call, the same care given to `subscriptions` elsewhere in
   * this file (see ARCHITECTURE.md's "partial updates must not reset
   * streamer subscriptions" note).
   */
  updateNotificationPreference(
    userId: string,
    channel: string,
    enabled: boolean,
  ): Promise<UpdateNotificationPreferenceResult>;
}
