import { EventEmitter } from "node:events";
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

function normalizeStreamerUsers(data: DocumentData | undefined): string[] {
  return Array.isArray(data?.users) ? (data.users as string[]) : [];
}

export class FirestoreSubscriptionRepository
  extends EventEmitter
  implements SubscriptionRepository
{
  private readonly users: CollectionReference<DocumentData>;
  private readonly streamers: CollectionReference<DocumentData>;

  constructor(db: Firestore) {
    super();

    this.users = db.collection("users");
    this.streamers = db.collection("streamers");
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

      const existingUsers = normalizeStreamerUsers(streamerDoc.data());

      tx.set(
        streamerRef,
        {
          id: streamerId,
          users: existingUsers.includes(userId)
            ? existingUsers
            : [...existingUsers, userId],
        },
        { merge: true },
      );

      return {
        success: true,
        createdStreamer: !streamerDoc.exists,
      } as const;
    });

    if ("createdStreamer" in result) {
      this.emit("streamerAdded", streamerId);
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
    const streamerRef = this.streamers.doc(streamerId);

    const result = await userRef.firestore.runTransaction(async (tx) => {
      const [userDoc, streamerDoc] = await Promise.all([
        tx.get(userRef),
        tx.get(streamerRef),
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

      const nextUsers = normalizeStreamerUsers(streamerDoc.data()).filter(
        (id) => id !== userId,
      );

      if (streamerDoc.exists) {
        tx.update(streamerRef, { users: nextUsers });
      }

      return {
        success: true,
        usersLeft: nextUsers.length,
      } as const;
    });

    if (result.success && result.usersLeft === 0) {
      this.emit("streamerEmpty", streamerId);
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
