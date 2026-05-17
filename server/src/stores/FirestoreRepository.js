const EventEmitter = require("events");
const { admin } = require("../config/firebase");
const { isNonEmptyString } = require("../utils/validators");
const { logger } = require("../utils/logger");

class FirestoreRepository extends EventEmitter {
  constructor(db, { onUserChanged } = {}) {
    super();
    this.db = db;
    this.users = db.collection("users");
    this.streamers = db.collection("streamers");

    if (onUserChanged) {
      this.users.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "modified")
            onUserChanged(change.doc.id, change.doc.data());
        });
      });
    }
  }

  async listUsers() {
    const snapshot = await this.users.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
  d;

  async getUser(userId) {
    if (!isNonEmptyString(userId)) return null;
    const doc = await this.users.doc(userId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  async saveUser(userId, data = {}) {
    if (!isNonEmptyString(userId)) throw new Error("Invalid user id");

    const userRef = this.users.doc(userId);

    await this.db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        transaction.set(userRef, {
          user_id: userId,
          canReceiveDM: false,
          streamers: [],
          ...data,
        });
        return;
      }

      transaction.set(
        userRef,
        {
          user_id: userId,
          ...data,
        },
        { merge: true },
      );
    });
  }

  getPushSubscriptionsRef(userId) {
    return this.users.doc(userId).collection("pushSubscriptions");
  }

  getPushSubscriptionId(subscription) {
    return Buffer.from(subscription.endpoint).toString("base64url");
  }

  async listPushSubscriptions(userId) {
    if (!isNonEmptyString(userId)) return [];
    const snapshot = await this.getPushSubscriptionsRef(userId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async savePushSubscription(userId, subscription, metadata = {}) {
    if (!isNonEmptyString(userId) || !subscription?.endpoint) {
      return { success: false, reason: "invalid_push_subscription" };
    }

    const id = this.getPushSubscriptionId(subscription);
    await this.getPushSubscriptionsRef(userId).doc(id).set(
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

  async markPushSubscriptionSeen(userId, subscriptionId) {
    if (!isNonEmptyString(userId) || !isNonEmptyString(subscriptionId)) return;
    await this.getPushSubscriptionsRef(userId).doc(subscriptionId).set(
      { lastSeenAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
  }

  async deletePushSubscription(userId, subscriptionIdOrSubscription) {
    if (!isNonEmptyString(userId)) return { success: false, reason: "invalid_user" };
    const id = typeof subscriptionIdOrSubscription === "string"
      ? subscriptionIdOrSubscription
      : this.getPushSubscriptionId(subscriptionIdOrSubscription);
    if (!isNonEmptyString(id)) return { success: false, reason: "invalid_push_subscription" };
    await this.getPushSubscriptionsRef(userId).doc(id).delete();
    return { success: true };
  }

  async listStreamers() {
    const snapshot = await this.streamers.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async getStreamer(streamerId) {
    if (!isNonEmptyString(streamerId)) return null;
    const doc = await this.streamers.doc(streamerId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  async createStreamer(streamerId) {
    await this.streamers
      .doc(streamerId)
      .set({ streamer_id: streamerId, users: [] }, { merge: true });
    this.emit("streamerAdded", streamerId);
  }

  async deleteStreamer(streamerId) {
    if (!isNonEmptyString(streamerId)) return;
    await this.streamers.doc(streamerId).delete();
    logger.info(`Deleted streamer ${streamerId}`);
  }

  async subscribeUserToStreamer(userId, streamerId, notificationMessage = "") {
    if (!isNonEmptyString(userId) || !isNonEmptyString(streamerId)) {
      return { success: false, reason: "invalid_input" };
    }

    const userRef = this.users.doc(userId);
    const streamerRef = this.streamers.doc(streamerId);

    return this.db
      .runTransaction(async (transaction) => {
        const [userDoc, streamerDoc] = await Promise.all([
          transaction.get(userRef),
          transaction.get(streamerRef),
        ]);

        const user = userDoc.exists
          ? userDoc.data()
          : { user_id: userId, canReceiveDM: false, streamers: [] };
        const streamers = user.streamers || [];
        if (streamers.some((streamer) => streamer.streamer_id === streamerId)) {
          return { success: false, reason: "already_subscribed" };
        }

        transaction.set(
          userRef,
          {
            ...user,
            streamers: [
              ...streamers,
              {
                streamer_id: streamerId,
                notification_message: notificationMessage,
              },
            ],
          },
          { merge: true },
        );

        const users = streamerDoc.exists ? streamerDoc.data().users || [] : [];
        transaction.set(
          streamerRef,
          {
            streamer_id: streamerId,
            users: users.includes(userId) ? users : [...users, userId],
          },
          { merge: true },
        );

        return { success: true, createdStreamer: !streamerDoc.exists };
      })
      .then((result) => {
        if (result.createdStreamer) this.emit("streamerAdded", streamerId);
        return result;
      });
  }

  async unsubscribeUserFromStreamer(userId, streamerId) {
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

      if (!userDoc.exists) return { success: false, reason: "user_not_found" };
      const streamers = userDoc.data().streamers || [];
      const nextStreamers = streamers.filter(
        (streamer) => streamer.streamer_id !== streamerId,
      );
      transaction.update(userRef, { streamers: nextStreamers });

      if (!streamerDoc.exists) return { success: true, usersLeft: 0 };
      const nextUsers = (streamerDoc.data().users || []).filter(
        (id) => id !== userId,
      );
      transaction.update(streamerRef, { users: nextUsers });
      return {
        success: true,
        wasSubscribed: nextStreamers.length !== streamers.length,
        usersLeft: nextUsers.length,
      };
    });

    if (result.success && result.usersLeft === 0)
      this.emit("streamerEmpty", streamerId);
    return result;
  }

  async getNotificationMessage(userId, streamerId) {
    const user = await this.getUser(userId);
    const streamer = user?.streamers?.find(
      (item) => item.streamer_id === streamerId,
    );
    return streamer?.notification_message || "";
  }

  async setNotificationMessage(userId, streamerId, notificationMessage = "") {
    if (typeof notificationMessage !== "string")
      return { success: false, reason: "invalid_message_type" };
    const user = await this.getUser(userId);
    if (!user) return { success: false, reason: "user_not_found" };

    const streamers = user.streamers || [];
    const nextStreamers = streamers.map((streamer) =>
      streamer.streamer_id === streamerId
        ? { ...streamer, notification_message: notificationMessage }
        : streamer,
    );

    if (
      nextStreamers.every((streamer) => streamer.streamer_id !== streamerId)
    ) {
      return { success: false, reason: "streamer_not_found" };
    }

    await this.users.doc(userId).update({ streamers: nextStreamers });
    return { success: true };
  }

  subscribe(userId, streamerId, notificationMessage = "") {
    return this.subscribeUserToStreamer(
      userId,
      streamerId,
      notificationMessage,
    );
  }

  unsubscribe(userId, streamerId) {
    return this.unsubscribeUserFromStreamer(userId, streamerId);
  }

  addOrUpdateUser(userId, data = {}) {
    return this.saveUser(userId, data);
  }

  getUsers() {
    return this.listUsers();
  }

  getStreamers() {
    return this.listStreamers();
  }

  getMessage(userId, streamerId) {
    return this.getNotificationMessage(userId, streamerId);
  }

  setMessage(userId, streamerId, notificationMessage = "") {
    return this.setNotificationMessage(userId, streamerId, notificationMessage);
  }

  fieldValue() {
    return admin.firestore.FieldValue;
  }
}

module.exports = { FirestoreRepository };
