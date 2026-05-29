import { EventEmitter } from "node:events";
import admin from "firebase-admin";
import type { User, UserStreamerSubscription } from "../types/user.js";
import type { Streamer } from "../types/streamer.js";
import type { PushSubscriptionRecord } from "../types/pushSubscription.js";

import type {
  Firestore,
  CollectionReference,
  DocumentData,
} from "firebase-admin/firestore";

import { isNonEmptyString } from "../utils/validators.js";
import { logger } from "../utils/logger.js";

export class FirestoreRepository extends EventEmitter {
  private readonly db: Firestore;
  private readonly users: CollectionReference<DocumentData>;
  private readonly streamers: CollectionReference<DocumentData>;

  constructor(
    db: Firestore,
    {
      onUserChanged,
    }: { onUserChanged?: (id: string, data: User) => void } = {},
  ) {
    super();

    this.db = db;
    this.users = db.collection("users");
    this.streamers = db.collection("streamers");

    if (onUserChanged) {
      this.users.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "modified") {
            onUserChanged(change.doc.id, change.doc.data() as User);
          }
        });
      });
    }
  }

  // -------------------------
  // USERS
  // -------------------------

  async listUsers(): Promise<User[]> {
    const snapshot = await this.users.get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<User, "id">),
    }));
  }

  async getUser(userId: string): Promise<User | null> {
    if (!isNonEmptyString(userId)) {
      return null;
    }
    const doc = await this.users.doc(userId).get();
    return doc.exists
      ? { id: doc.id, ...(doc.data() as Omit<User, "id">) }
      : null;
  }

  async saveUser(
    userId: string,
    data: Partial<Omit<User, "id">> = {},
  ): Promise<void> {
    if (!isNonEmptyString(userId)) {
      throw new Error("Invalid user id");
    }

    const userRef = this.users.doc(userId);

    await this.db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        transaction.set(userRef, {
          canReceiveDM: false,
          streamers: [],
          ...data,
        });
        return;
      }

      transaction.set(
        userRef,
        {
          id: userId,
          ...data,
        },
        { merge: true },
      );
    });
  }

  getPushSubscriptionsRef(userId: string): CollectionReference<DocumentData> {
    return this.users.doc(userId).collection("pushSubscriptions");
  }

  getPushSubscriptionId(subscription: { endpoint: string }): string {
    return Buffer.from(subscription.endpoint).toString("base64url");
  }

  async listPushSubscriptions(
    userId: string,
  ): Promise<PushSubscriptionRecord[]> {
    if (!isNonEmptyString(userId)) return [];

    const snapshot = await this.getPushSubscriptionsRef(userId).get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<PushSubscriptionRecord, "id">),
    }));
  }

  async savePushSubscription(
    userId: string,
    subscription: { endpoint: string },
    metadata: { userAgent?: string } = {},
  ): Promise<{ success: boolean; reason?: string; id?: string }> {
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
  ): Promise<{ success: boolean; reason?: string }> {
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

  // -------------------------
  // STREAMERS
  // -------------------------

  async listStreamers(): Promise<Streamer[]> {
    const snapshot = await this.streamers.get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<Streamer, "id">),
    }));
  }

  async getStreamer(id: string): Promise<Streamer | null> {
    if (!isNonEmptyString(id)) return null;

    const doc = await this.streamers.doc(id).get();

    return doc.exists
      ? { id: doc.id, ...(doc.data() as Omit<Streamer, "id">) }
      : null;
  }

  async createStreamer(id: string): Promise<void> {
    await this.streamers.doc(id).set(
      {
        id: id,
        users: [],
      },
      { merge: true },
    );

    this.emit("streamerAdded", id);
  }

  async deleteStreamer(id: string): Promise<void> {
    if (!isNonEmptyString(id)) return;

    await this.streamers.doc(id).delete();

    logger.info(`Deleted streamer ${id}`);
  }

  // -------------------------
  // SUBSCRIPTIONS
  // -------------------------

  async subscribeUserToStreamer(
    userId: string,
    streamerId: string,
    notificationMessage = "",
  ): Promise<{ success: boolean; reason?: string; createdStreamer?: boolean }> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(streamerId)) {
      return { success: false, reason: "invalid_input" };
    }

    const userRef = this.users.doc(userId);
    const streamerRef = this.streamers.doc(streamerId);

    const result = await this.db.runTransaction(async (transaction) => {
      const [userDoc, streamerDoc] = await Promise.all([
        transaction.get(userRef),
        transaction.get(streamerRef),
      ]);

      const user = userDoc.exists
        ? (userDoc.data() as User)
        : { user_id: userId, canReceiveDM: false, streamers: [] };

      const streamers = user.streamers || [];

      if (streamers.some((s: Streamer) => s.id === streamerId)) {
        return { success: false, reason: "already_subscribed" };
      }

      transaction.set(
        userRef,
        {
          ...user,
          streamers: [
            ...streamers,
            {
              id: streamerId,
              notification_message: notificationMessage,
            },
          ],
        },
        { merge: true },
      );

      const users = streamerDoc.exists ? streamerDoc.data()?.users || [] : [];

      transaction.set(
        streamerRef,
        {
          id: streamerId,
          users: users.includes(userId) ? users : [...users, userId],
        },
        { merge: true },
      );

      return {
        success: true,
        createdStreamer: !streamerDoc.exists,
      };
    });

    if (result.createdStreamer) {
      this.emit("streamerAdded", streamerId);
    }

    return result;
  }

  async unsubscribeUserFromStreamer(
    userId: string,
    streamerId: string,
  ): Promise<{ success: boolean; reason?: string; usersLeft?: number }> {
    if (!isNonEmptyString(userId) || !isNonEmptyString(streamerId)) {
      return { success: false, reason: "invalid_input" };
    }

    const userRef = this.users.doc(userId);
    const streamerRef = this.streamers.doc(streamerId);

    const result = await this.db.runTransaction(async (transaction) => {
      const [userDoc, streamerDoc] = await Promise.all([
        transaction.get(userRef),
        transaction.get(streamerRef),
      ]);

      if (!userDoc.exists) {
        return { success: false, reason: "user_not_found" };
      }

      const streamers = (userDoc.data() as User).streamers || [];

      const nextStreamers = streamers.filter(
        (s: UserStreamerSubscription) => s.id !== streamerId,
      );

      transaction.update(userRef, { streamers: nextStreamers });

      const nextUsers = streamerDoc.exists
        ? (streamerDoc.data()?.users || []).filter(
            (id: string) => id !== userId,
          )
        : [];

      if (streamerDoc.exists) {
        transaction.update(streamerRef, { users: nextUsers });
      }

      return {
        success: true,
        usersLeft: nextUsers.length,
      };
    });

    if (result.success && result.usersLeft === 0) {
      this.emit("streamerEmpty", streamerId);
    }

    return result;
  }

  // -------------------------
  // MESSAGES
  // -------------------------

  async getNotificationMessage(
    userId: string,
    streamerId: string,
  ): Promise<string> {
    const user = await this.getUser(userId);

    const streamer = user?.streamers?.find(
      (s: UserStreamerSubscription) => s.id === streamerId,
    );

    return streamer?.notification_message || "";
  }

  async setNotificationMessage(
    userId: string,
    streamerId: string,
    notificationMessage = "",
  ): Promise<{ success: boolean; reason?: string }> {
    if (typeof notificationMessage !== "string") {
      return { success: false, reason: "invalid_message_type" };
    }

    const user = await this.getUser(userId);

    if (!user) {
      return { success: false, reason: "user_not_found" };
    }

    const streamers = user.streamers || [];

    const nextStreamers = streamers.map((s: UserStreamerSubscription) =>
      s.id === streamerId
        ? { ...s, notification_message: notificationMessage }
        : s,
    );

    await this.users.doc(userId).update({ streamers: nextStreamers });

    return { success: true };
  }

  // -------------------------
  // ALIASES (kept for compatibility)
  // -------------------------

  subscribe = this.subscribeUserToStreamer;
  unsubscribe = this.unsubscribeUserFromStreamer;
  getUsers = this.listUsers;
  getStreamers = this.listStreamers;
  getMessage = this.getNotificationMessage;
  setMessage = this.setNotificationMessage;
}
