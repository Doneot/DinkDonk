import type {
  Firestore,
  CollectionReference,
  DocumentData,
} from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

import type {
  SavePushSubscribeResult,
  DeletePushSubscribeResult,
} from "../../types/PushSubscribeResult.js";
import type { PushSubscription } from "../../domain/PushSubscription.js";
import { MAX_PUSH_SUBSCRIPTIONS } from "../../domain/PushSubscription.js";
import type { PushSubscriptionRepository } from "../../ports/PushSubscriptionRepository.js";
import { isNonEmptyString } from "../../../../shared/utils/validators.js";
import { logger } from "../../../../shared/logger/logger.js";

export class FirestorePushSubscriptionRepository
  implements PushSubscriptionRepository
{
  private readonly users: CollectionReference<DocumentData>;

  constructor(db: Firestore) {
    this.users = db.collection("users");
  }

  private getPushSubscriptionsRef(
    userId: string,
  ): CollectionReference<DocumentData> {
    return this.users.doc(userId).collection("pushSubscriptions");
  }

  private getPushSubscriptionId(subscription: { endpoint: string }): string {
    return Buffer.from(subscription.endpoint).toString("base64url");
  }

  async getPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    if (!isNonEmptyString(userId)) return [];

    const snapshot = await this.getPushSubscriptionsRef(userId).get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<PushSubscription, "id">),
    }));
  }

  async savePushSubscription(
    userId: string,
    subscription: PushSubscription["subscription"],
    metadata: { userAgent?: string } = {},
  ): Promise<SavePushSubscribeResult> {
    if (!isNonEmptyString(userId) || !subscription?.endpoint) {
      return { success: false, reason: "invalid_push_subscription" };
    }

    const id = this.getPushSubscriptionId(subscription);
    const subscriptionsRef = this.getPushSubscriptionsRef(userId);
    const docRef = subscriptionsRef.doc(id);

    return this.users.firestore.runTransaction(async (tx) => {
      const doc = await tx.get(docRef);

      // Re-saving an endpoint that's already stored (e.g. a browser
      // refreshing its own subscription) always succeeds regardless of the
      // cap below - only a genuinely new subscription counts against it.
      if (!doc.exists) {
        // An aggregate count avoids transferring every subscription document
        // just to answer "is this user at the cap" - same pattern as
        // FirestoreStreamerRepository#deleteStreamerIfEmpty.
        const countSnapshot = await tx.get(subscriptionsRef.count());

        if (countSnapshot.data().count >= MAX_PUSH_SUBSCRIPTIONS) {
          return {
            success: false,
            reason: "push_subscription_limit_reached",
          } as const;
        }
      }

      tx.set(
        docRef,
        {
          subscription,
          userAgent: metadata.userAgent || "",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          lastSeenAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      return { success: true, id } as const;
    });
  }

  async markPushSubscriptionSeen(
    userId: string,
    subscriptionId: string,
  ): Promise<void> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(subscriptionId)) return;

    // update(), not set(..., {merge: true}): the latter would recreate this
    // doc if it no longer exists - e.g. the user deleted this exact
    // subscription (DELETE /api/notifications/web-push/subscriptions) while
    // this call's send() was already in flight for it - resurrecting a
    // corrupt record with only lastSeenAt and no `subscription` field. That
    // doc would then permanently occupy a MAX_PUSH_SUBSCRIPTIONS slot and
    // fail every future send for it. update() throws instead of creating,
    // so a since-deleted doc is just a no-op here rather than a resurrection.
    try {
      await this.getPushSubscriptionsRef(userId).doc(subscriptionId).update({
        lastSeenAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      logger.warn(
        { error, userId, subscriptionId },
        "Could not mark push subscription as seen; it may have been deleted concurrently",
      );
    }
  }

  async deletePushSubscription(
    userId: string,
    subscription: string | { endpoint: string },
  ): Promise<DeletePushSubscribeResult> {
    if (!isNonEmptyString(userId)) {
      return { success: false, reason: "invalid_user" };
    }

    const id =
      typeof subscription === "string"
        ? subscription
        : this.getPushSubscriptionId(subscription);

    if (!isNonEmptyString(id)) {
      return { success: false, reason: "invalid_push_subscription" };
    }

    await this.getPushSubscriptionsRef(userId).doc(id).delete();

    return { success: true };
  }
}
