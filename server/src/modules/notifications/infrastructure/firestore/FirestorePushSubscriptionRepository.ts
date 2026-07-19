import type {
  Firestore,
  CollectionReference,
  DocumentData,
} from "firebase-admin/firestore";
import admin from "firebase-admin";

import type {
  SavePushSubscribeResult,
  DeletePushSubscribeResult,
} from "../../types/PushSubscribeResult.js";
import type { PushSubscription } from "../../domain/PushSubscription.js";
import { isNonEmptyString } from "../../../../shared/utils/validators.js";

export class FirestorePushSubscriptionRepository {
  private readonly db: Firestore;
  private readonly users: CollectionReference<DocumentData>;

  constructor(db: Firestore) {
    this.db = db;
    this.users = this.db.collection("users");
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

    await this.getPushSubscriptionsRef(userId)
      .doc(id)
      .set(
        {
          subscription,
          userAgent: metadata.userAgent || "",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    return { success: true, id };
  }

  async markPushSubscriptionSeen(
    userId: string,
    subscriptionId: string,
  ): Promise<void> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(subscriptionId)) return;

    await this.getPushSubscriptionsRef(userId).doc(subscriptionId).set(
      {
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
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
