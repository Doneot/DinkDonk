import type {
  Firestore,
  CollectionReference,
  DocumentData,
} from "firebase-admin/firestore";

import type { DomainEventBus } from "../../../../shared/events/DomainEventBus.js";
import { logger } from "../../../../shared/logger/logger.js";
import { getExistingDoc } from "../../../../shared/utils/firestore.js";
import { isNonEmptyString } from "../../../../shared/utils/validators.js";
import type { UpdateNotificationPreferenceResult } from "../../domain/NotificationPreferenceResult.js";
import type {
  SubscribeResult,
  UnsubscribeResult,
  UpdateSubscriptionResult,
} from "../../domain/SubscribeResult.js";
import type { Subscription } from "../../domain/Subscription.js";
import { MAX_SUBSCRIPTIONS } from "../../domain/Subscription.js";
import type { User } from "../../domain/User.js";
import type { UserUpdate } from "../../domain/UserUpdate.js";
import type { UserRepository } from "../../ports/UserRepository.js";
import { SubscriptionSchema } from "../../schemas/SubscriptionSchema.js";
import { toUser } from "./mappers/userMapper.js";
import { UserRecordSchema, UserUpdateSchema } from "./records/UserRecord.js";

export class FirestoreUserRepository implements UserRepository {
  // Zero production callers today (confirmed by audit) - getUsers' default
  // cap still applies even when no limit is passed, so it can never
  // accidentally become a truly unbounded collection read once it does get
  // a caller.
  private static readonly DEFAULT_USERS_LIMIT = 500;

  // Firestore#getAll has no hard documented cap, but chunking keeps each
  // RPC's payload/latency bounded regardless of how many ids a caller (e.g.
  // a large streamer's subscriber fan-out) passes in one call.
  private static readonly GET_ALL_CHUNK_SIZE = 300;

  private readonly db: Firestore;
  private readonly users: CollectionReference<DocumentData>;
  private readonly streamers: CollectionReference<DocumentData>;

  constructor(
    db: Firestore,
    readonly events: DomainEventBus,
  ) {
    this.db = db;
    this.users = db.collection("users");
    this.streamers = db.collection("streamers");
  }

  private subscribersOf(streamerId: string): CollectionReference<DocumentData> {
    return this.streamers.doc(streamerId).collection("subscribers");
  }

  async getUser(userId: string): Promise<User | null> {
    const doc = await getExistingDoc(this.users, userId);

    if (!doc) {
      return null;
    }

    return toUser(doc.id, UserRecordSchema.parse(doc.data()));
  }

  async getUsers(
    limit: number = FirestoreUserRepository.DEFAULT_USERS_LIMIT,
  ): Promise<User[]> {
    const snapshot = await this.users.limit(limit).get();

    return snapshot.docs.map((doc) => {
      const record = UserRecordSchema.parse(doc.data());

      return toUser(doc.id, record);
    });
  }

  async getUsersByIds(userIds: string[]): Promise<User[]> {
    const ids = userIds.filter(isNonEmptyString);

    if (ids.length === 0) {
      return [];
    }

    const users: User[] = [];

    for (
      let i = 0;
      i < ids.length;
      i += FirestoreUserRepository.GET_ALL_CHUNK_SIZE
    ) {
      const chunk = ids.slice(i, i + FirestoreUserRepository.GET_ALL_CHUNK_SIZE);
      const refs = chunk.map((id) => this.users.doc(id));
      const docs = await this.db.getAll(...refs);

      for (const doc of docs) {
        if (doc.exists) {
          users.push(toUser(doc.id, UserRecordSchema.parse(doc.data())));
        }
      }
    }

    return users;
  }

  async updateUser(userId: string, data: UserUpdate): Promise<void> {
    if (!isNonEmptyString(userId)) {
      throw new Error("Invalid user id");
    }

    const validated = UserUpdateSchema.parse(data);

    await this.users.doc(userId).set(validated, { merge: true });
  }

  async countUsersReceivingDM(): Promise<number> {
    const snapshot = await this.users
      .where("canReceiveDM", "==", true)
      .count()
      .get();

    return snapshot.data().count;
  }

  watchUsers(
    onChange: (user: User) => void,
    onError: (error: Error) => void,
  ): () => void {
    return this.users.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== "modified") {
          return;
        }

        try {
          const record = UserRecordSchema.parse(change.doc.data());

          onChange(toUser(change.doc.id, record));
        } catch (error) {
          logger.error(
            { error, userId: change.doc.id },
            "Failed to parse a watched user record",
          );
        }
      });
    }, onError);
  }

  async subscribe(
    userId: string,
    streamerId: string,
    notificationMessage = "",
  ): Promise<SubscribeResult> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(streamerId)) {
      return { success: false, reason: "invalid_input" };
    }

    const userRef = this.users.doc(userId);
    const streamerRef = this.streamers.doc(streamerId);
    const subscriberRef = this.subscribersOf(streamerId).doc(userId);

    const result = await this.db.runTransaction(async (tx) => {
      const [userDoc, streamerDoc] = await Promise.all([
        tx.get(userRef),
        tx.get(streamerRef),
      ]);

      const user = userDoc.exists
        ? toUser(userId, UserRecordSchema.parse(userDoc.data()))
        : toUser(userId, UserRecordSchema.parse({}));

      const currentSubscriptions = user.subscriptions;

      const alreadySubscribed = currentSubscriptions.some(
        (s) => s.id === streamerId,
      );

      if (alreadySubscribed) {
        return {
          success: false,
          reason: "already_subscribed",
        } as const;
      }

      // Enforced here, before the write, rather than only retroactively by
      // UserRecordSchema.parse on the next read: without this, a 201st
      // subscription writes successfully but leaves the document permanently
      // unparseable by every method that reads it first - including
      // unsubscribe's own read, so the user couldn't even self-heal by
      // removing a subscription.
      if (currentSubscriptions.length >= MAX_SUBSCRIPTIONS) {
        return {
          success: false,
          reason: "subscription_limit_reached",
        } as const;
      }

      // Validated against SubscriptionSchema BEFORE it's written, so an
      // invalid entry (e.g. a too-long notification_message) throws a clear
      // Zod error right here instead of silently corrupting the user's
      // document - previously the only validation was retroactive, on the
      // next read via UserRecordSchema.parse, by which point the document
      // was already "bricked".
      const newSubscription = SubscriptionSchema.parse({
        id: streamerId,
        notification_message: notificationMessage,
      });

      // A plain tx.update (as unsubscribe/updateSubscription use) isn't safe
      // here the way it is for them: they've both already confirmed
      // userDoc.exists before reaching this point, but a user's very first
      // subscribe has no prior document to update - Firestore's update()
      // rejects when the target doc doesn't exist. {merge: true} creates it
      // on demand while still writing only the touched field, rather than
      // the previous ...user spread that also wrote a redundant `id` into
      // the document (the doc's own key already is the user id).
      tx.set(
        userRef,
        { subscriptions: [...currentSubscriptions, newSubscription] },
        { merge: true },
      );

      tx.set(streamerRef, { id: streamerId }, { merge: true });

      tx.set(subscriberRef, { subscribedAt: Date.now() });

      return {
        success: true,
        createdStreamer: !streamerDoc.exists,
      } as const;
    });

    // Emitted on every successful subscribe, not just when createdStreamer
    // is true: the streamer doc persists even after its last subscriber
    // leaves (nothing deletes it), so gating on doc-existence previously
    // meant re-subscribing to a streamer everyone had since dropped skipped
    // this entirely - silently leaving no EventSub subscription behind for
    // a streamer someone is actively (and, as far as they know, currently)
    // tracking. handleStreamerAdded's ensureSubscriptions is already
    // idempotent (it checks Twitch's real subscription state before
    // creating anything), so firing unconditionally just makes the doc's
    // existence irrelevant to correctness, at the cost of one extra cheap
    // Twitch API check on the (common) case where a subscription already
    // exists.
    if (result.success) {
      this.events.emit({ type: "streamerAdded", streamerId });
    }

    return result;
  }

  async unsubscribe(
    userId: string,
    streamerId: string,
  ): Promise<UnsubscribeResult> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(streamerId)) {
      return { success: false, reason: "invalid_input" };
    }

    const userRef = this.users.doc(userId);
    const subscribersRef = this.subscribersOf(streamerId);
    const subscriberRef = subscribersRef.doc(userId);

    const result = await this.db.runTransaction(async (tx) => {
      // An aggregate count plus a single existence check on this user's own
      // subscriber doc avoids transferring every subscriber document just to
      // compute how many remain.
      const [userDoc, subscriberDoc, subscriberCount] = await Promise.all([
        tx.get(userRef),
        tx.get(subscriberRef),
        tx.get(subscribersRef.count()),
      ]);

      if (!userDoc.exists) {
        return {
          success: false,
          reason: "user_not_found",
        } as const;
      }

      const user = toUser(userId, UserRecordSchema.parse(userDoc.data()));
      const wasSubscribed = user.subscriptions.some((s) => s.id === streamerId);

      if (!wasSubscribed) {
        // Distinguishes "there was nothing to unsubscribe from" from an
        // actual unsubscribe - without this, calling unsubscribe on a
        // streamer the user was never subscribed to fell through to a
        // no-op delete/filter and still reported {success: true}.
        return {
          success: false,
          reason: "not_subscribed",
        } as const;
      }

      const nextSubscriptions = user.subscriptions.filter(
        (s) => s.id !== streamerId,
      );

      tx.update(userRef, { subscriptions: nextSubscriptions });

      tx.delete(subscriberRef);

      const usersLeft =
        subscriberCount.data().count - (subscriberDoc.exists ? 1 : 0);

      return {
        success: true,
        usersLeft,
      } as const;
    });

    if (result.success && result.usersLeft === 0) {
      this.events.emit({ type: "streamerEmpty", streamerId });
    }

    return result;
  }

  async getSubscription(
    userId: string,
    streamerId: string,
  ): Promise<Subscription | null> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(streamerId)) {
      return null;
    }

    const doc = await this.users.doc(userId).get();

    if (!doc.exists) return null;

    const user = toUser(userId, UserRecordSchema.parse(doc.data()));

    return user.subscriptions.find((s) => s.id === streamerId) ?? null;
  }

  async updateSubscription(
    userId: string,
    streamerId: string,
    data: Partial<Omit<Subscription, "id">>,
  ): Promise<UpdateSubscriptionResult> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(streamerId)) {
      return { success: false, reason: "invalid_input" };
    }

    const userRef = this.users.doc(userId);

    // Defense-in-depth alongside the Partial<Omit<Subscription, "id">> patch
    // type: even if a caller's `data` were cast/widened to smuggle an `id`
    // through, it's stripped here so it can never override the entry being
    // updated and desynchronize it from the `subscribers` subcollection doc
    // (which stays keyed by the original id).
    const { id: _ignoredId, ...patch } = data as Partial<Subscription>;

    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(userRef);

      if (!doc.exists) {
        return {
          success: false,
          reason: "user_not_found",
        } as const;
      }

      const user = toUser(userId, UserRecordSchema.parse(doc.data()));

      const exists = user.subscriptions.some((s) => s.id === streamerId);

      if (!exists) {
        return {
          success: false,
          reason: "subscription_not_found",
        } as const;
      }

      // Validated against SubscriptionSchema BEFORE it's written - see the
      // matching comment in subscribe() for why this can't be left to the
      // next read's retroactive UserRecordSchema.parse.
      const nextSubscriptions = user.subscriptions.map((s) =>
        s.id === streamerId
          ? SubscriptionSchema.parse({ ...s, ...patch })
          : s,
      );

      tx.update(userRef, { subscriptions: nextSubscriptions });

      return { success: true } as const;
    });
  }

  async updateNotificationPreference(
    userId: string,
    channel: string,
    enabled: boolean,
  ): Promise<UpdateNotificationPreferenceResult> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(channel)) {
      return { success: false, reason: "invalid_input" };
    }

    const userRef = this.users.doc(userId);

    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(userRef);

      if (!doc.exists) {
        return { success: false, reason: "user_not_found" } as const;
      }

      const user = toUser(userId, UserRecordSchema.parse(doc.data()));

      // The whole map is read here and written back below rather than
      // relying on Firestore's set({merge:true}) to merge *inside* a nested
      // object field - that behavior isn't something to lean on for
      // correctness, so the merge happens explicitly in JS first and the
      // write only ever replaces this one top-level field with an already-
      // complete value.
      const nextPreferences = {
        ...(user.notificationPreferences ?? {}),
        [channel]: enabled,
      };

      tx.set(
        userRef,
        { notificationPreferences: nextPreferences },
        { merge: true },
      );

      return { success: true } as const;
    });
  }
}
