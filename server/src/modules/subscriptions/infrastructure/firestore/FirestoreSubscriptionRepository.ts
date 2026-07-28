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

/**
 * Normalizers (key to eliminating ESLint unsafe issues)
 */
function normalizeUserRecord(
  userId: string,
  data: DocumentData | undefined,
): User {
  return {
    id: userId,
    canReceiveDM: Boolean(data?.canReceiveDM),
    subscriptions: Array.isArray(data?.subscriptions)
      ? (data.subscriptions as Subscription[])
      : [],
  };
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

      tx.set(
        userRef,
        {
          ...user,
          subscriptions: [
            ...currentSubscriptions,
            {
              id: streamerId,
              notification_message: notificationMessage,
            },
          ],
        },
        { merge: true },
      );

      tx.set(streamerRef, { id: streamerId }, { merge: true });

      tx.set(subscriberRef, { subscribedAt: Date.now() });

      return {
        success: true,
        createdStreamer: !streamerDoc.exists,
      } as const;
    });

    if ("createdStreamer" in result) {
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
      const [userDoc, subscribers] = await Promise.all([
        tx.get(userRef),
        tx.get(subscribersRef),
      ]);

      if (!userDoc.exists) {
        return {
          success: false,
          reason: "user_not_found",
        } as const;
      }

      const user = normalizeUserRecord(userId, userDoc.data());
      const nextSubscriptions = user.subscriptions.filter(
        (s) => s.id !== streamerId,
      );

      tx.update(userRef, { subscriptions: nextSubscriptions });

      tx.delete(subscriberRef);

      const usersLeft = subscribers.docs.filter(
        (doc) => doc.id !== userId,
      ).length;

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
    data: Partial<Subscription>,
  ): Promise<UpdateSubscriptionResult> {
    const userRef = this.users.doc(userId);

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

      const nextSubscriptions = user.subscriptions.map((s) =>
        s.id === streamerId ? { ...s, ...data } : s,
      );

      tx.update(userRef, { subscriptions: nextSubscriptions });

      return { success: true } as const;
    });
  }
}
