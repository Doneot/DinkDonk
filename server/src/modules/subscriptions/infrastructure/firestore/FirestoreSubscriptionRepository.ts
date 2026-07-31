import type {
  Firestore,
  CollectionReference,
  DocumentData,
} from "firebase-admin/firestore";

import type {
  SubscribeResult,
  UnsubscribeResult,
  UpdateSubscriptionResult,
} from "../../types/SubscribeResult.js";

import type { SubscriptionRepository } from "../../ports/SubscriptionRepository.js";
import type { User } from "../../../users/domain/User.js";
import type { Subscription } from "../../domain/Subscription.js";
import type { DomainEventBus } from "../../../../shared/events/DomainEventBus.js";

import { isNonEmptyString } from "../../../../shared/utils/validators.js";
import { UserRecordSchema } from "../../../users/infrastructure/firestore/records/UserRecord.js";
import { toUser } from "../../../users/infrastructure/firestore/mappers/userMapper.js";
import { SubscriptionSchema } from "../../schemas/SubscriptionSchema.js";

// Reuses FirestoreUserRepository's validated schema/mapper rather than an
// unchecked cast, so a malformed user document surfaces as a Zod error
// instead of silently coercing to an empty subscriptions array. A missing
// document (a user's first-ever subscribe) parses the same way an empty
// record would, since every field on UserRecordSchema has a default.
function normalizeUserRecord(
  userId: string,
  data: DocumentData | undefined,
): User {
  return toUser(userId, UserRecordSchema.parse(data ?? {}));
}

export class FirestoreSubscriptionRepository implements SubscriptionRepository {
  private readonly users: CollectionReference<DocumentData>;
  private readonly streamers: CollectionReference<DocumentData>;

  constructor(
    db: Firestore,
    readonly events: DomainEventBus,
  ) {
    this.users = db.collection("users");
    this.streamers = db.collection("streamers");
  }

  private subscribersOf(streamerId: string): CollectionReference<DocumentData> {
    return this.streamers.doc(streamerId).collection("subscribers");
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

    const result = await userRef.firestore.runTransaction(async (tx) => {
      const [userDoc, streamerDoc] = await Promise.all([
        tx.get(userRef),
        tx.get(streamerRef),
      ]);

      const user = userDoc.exists
        ? normalizeUserRecord(userId, userDoc.data())
        : normalizeUserRecord(userId, undefined);

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

    if (result.success && result.createdStreamer) {
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

    const result = await userRef.firestore.runTransaction(async (tx) => {
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

      const user = normalizeUserRecord(userId, userDoc.data());
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

    const user = normalizeUserRecord(userId, doc.data());

    return user.subscriptions.find((s) => s.id === streamerId) ?? null;
  }

  async updateSubscription(
    userId: string,
    streamerId: string,
    data: Partial<Omit<Subscription, "id">>,
  ): Promise<UpdateSubscriptionResult> {
    const userRef = this.users.doc(userId);

    // Defense-in-depth alongside the Partial<Omit<Subscription, "id">> patch
    // type: even if a caller's `data` were cast/widened to smuggle an `id`
    // through, it's stripped here so it can never override the entry being
    // updated and desynchronize it from the `subscribers` subcollection doc
    // (which stays keyed by the original id).
    const { id: _ignoredId, ...patch } = data as Partial<Subscription>;

    return userRef.firestore.runTransaction(async (tx) => {
      const doc = await tx.get(userRef);

      if (!doc.exists) {
        return {
          success: false,
          reason: "user_not_found",
        } as const;
      }

      const user = normalizeUserRecord(userId, doc.data());

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
}
