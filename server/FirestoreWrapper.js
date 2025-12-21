// server/FirestoreWrapper.js
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const EventEmitter = require("events");
const {
  FIREBASE_PROJECT_ID,
  FIREBASE_PRIVATE_KEY_ID,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_CLIENT_ID,
  FIREBASE_CLIENT_X509_CERT_URL,
} = require("./config");

function isValidString(str) {
  return typeof str === "string" && str.trim().length > 0;
}

class FirestoreWrapper extends EventEmitter {
  constructor({ handleUserChange }) {
    super();
    const serviceAccount = {
      type: "service_account",
      project_id: FIREBASE_PROJECT_ID,
      private_key_id: FIREBASE_PRIVATE_KEY_ID,
      private_key: FIREBASE_PRIVATE_KEY,
      client_email: FIREBASE_CLIENT_EMAIL,
      client_id: FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: FIREBASE_CLIENT_X509_CERT_URL,
      universe_domain: "googleapis.com",
    };

    this.handleUserChange = handleUserChange;

    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    this._db = getFirestore();
    this._db.collection("users").onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "modified") {
          const updatedUser = change.doc.data();
          const userId = change.doc.id;
          this.handleUserChange(userId, updatedUser);
        }
      });
    });
  }

  get db() {
    return this._db;
  }

  async getUsers() {
    try {
      const usersSnapshot = await this._db.collection("users").get();
      return usersSnapshot.docs.map((doc) => doc.data());
    } catch (error) {
      console.error("Error getting users:", error);
      return [];
    }
  }

  async getUser(user_id) {
    if (!isValidString(user_id)) {
      console.error(`Invalid user_id: [${user_id}]`);
      return null;
    }
    try {
      const userRef = this._db.collection("users").doc(user_id);
      const userDoc = await userRef.get();
      return userDoc.data();
    } catch (error) {
      console.error("Error getting user:", user_id, error);
      return null;
    }
  }

  async getStreamers() {
    try {
      const streamersSnapshot = await this._db.collection("streamers").get();
      return streamersSnapshot.docs.map((doc) => doc.data());
    } catch (error) {
      console.error("Error getting streamers:", error);
      return [];
    }
  }

  async getStreamer(streamer_id) {
    if (!isValidString(streamer_id)) {
      console.error(`Invalid streamer_id: [${streamer_id}]`);
      return null;
    }
    try {
      const streamerRef = this._db.collection("streamers").doc(streamer_id);
      const streamerDoc = await streamerRef.get();
      return streamerDoc.data();
    } catch (error) {
      console.error("Error getting streamer:", streamer_id);
      return null;
    }
  }

  async addOrUpdateUser(user_id, userData = {}) {
    if (!isValidString(user_id)) {
      console.error(`Invalid user_id: [${user_id}]`);
      return;
    }

    try {
      const userRef = this._db.collection("users").doc(user_id);
      const userDoc = await userRef.get();

      if (userDoc.exists) {
        await userRef.update(userData);
      } else {
        await userRef.set(
          {
            user_id,
            canReceiveDM: false,
            streamers: [],
            ...userData,
          },
          { merge: true }
        );
      }
    } catch (error) {
      console.error("Error adding/updating user:", error);
    }
  }

  async _addStreamer(streamer_id) {
    try {
      await this._db
        .collection("streamers")
        .doc(streamer_id)
        .set({ streamer_id, users: [] });
      this.emit("streamerAdded", streamer_id);
    } catch (error) {
      console.error("Error adding streamer:", error);
    }
  }

  async deleteStreamer(streamer_id) {
    if (!isValidString(streamer_id)) return;

    try {
      await this._db.collection("streamers").doc(streamer_id).delete();
      console.log(`🗑️ Deleted streamer doc [${streamer_id}]`);
    } catch (err) {
      console.error(`Failed to delete streamer [${streamer_id}]`, err);
    }
  }

  async subscribe(user_id, streamer_id, notification_message = "") {
    if (!isValidString(user_id) || !isValidString(streamer_id)) {
      const msg = `Invalid input in subscribe: user_id=[${user_id}], streamer_id=[${streamer_id}]`;
      console.error(msg);
      return { success: false, reason: "invalid_input", message: msg };
    }

    try {
      const userRef = this._db.collection("users").doc(user_id);
      let userDoc = await userRef.get();
      if (!userDoc.exists) {
        await this.addOrUpdateUser(user_id);
        userDoc = await userRef.get();
      }

      const streamers = userDoc.data()["streamers"];
      const alreadySubscribed = streamers.some(
        (s) => s["streamer_id"] === streamer_id
      );

      if (alreadySubscribed) {
        const msg = `Streamer [${streamer_id}] is already registered for user [${user_id}]`;
        console.warn(msg);
        return { success: false, reason: "already_subscribed", message: msg };
      }

      await userRef.update({
        streamers: admin.firestore.FieldValue.arrayUnion({
          streamer_id,
          notification_message,
        }),
      });

      const streamerRef = this._db.collection("streamers").doc(streamer_id);
      let streamerDoc = await streamerRef.get();

      if (!streamerDoc.exists) {
        await this._addStreamer(streamer_id);
        streamerDoc = await streamerRef.get();
      }

      const users = streamerDoc.data()["users"];
      const alreadyHasUser = users.includes(user_id);

      if (!alreadyHasUser) {
        await streamerRef.update({
          users: admin.firestore.FieldValue.arrayUnion(user_id),
        });
      }

      return { success: true };
    } catch (error) {
      console.error(
        `Error subscribing user [${user_id}] to streamer [${streamer_id}]`,
        error
      );
      return { success: false, reason: "exception", error };
    }
  }

  async unsubscribe(user_id, streamer_id) {
    if (!isValidString(user_id) || !isValidString(streamer_id)) {
      const msg = `Invalid input in unsubscribe: user_id=[${user_id}], streamer_id=[${streamer_id}]`;
      console.error(msg);
      return { success: false, reason: "invalid_input", message: msg };
    }

    try {
      const userRef = this._db.collection("users").doc(user_id);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        const msg = `No user found for id [${user_id}]`;
        console.warn(msg);
        return { success: false, reason: "user_not_found", message: msg };
      }

      const streamers = userDoc.data()["streamers"];
      const wasSubscribed = streamers.some(
        (s) => s["streamer_id"] === streamer_id
      );

      await userRef.update({
        streamers: streamers.filter((s) => s["streamer_id"] !== streamer_id),
      });

      const streamerRef = this._db.collection("streamers").doc(streamer_id);
      const streamerDoc = await streamerRef.get();

      if (!streamerDoc.exists) {
        const msg = `No streamer found for id [${streamer_id}]`;
        console.warn(msg);
        return { success: false, reason: "streamer_not_found", message: msg };
      }

      await streamerRef.update({
        users: admin.firestore.FieldValue.arrayRemove(user_id),
      });

      const updatedDoc = await streamerRef.get();
        const usersLeft = updatedDoc.data()?.users?.length ?? 0;

        if (usersLeft === 0) {
          this.emit("streamerEmpty", streamer_id);
        }

      return { success: true, wasSubscribed };
    } catch (error) {
      console.error(
        `Error unsubscribing user [${user_id}] from streamer [${streamer_id}]`,
        error
      );
      return { success: false, reason: "exception", error };
    }
  }

  async getMessage(user_id, streamer_id) {
    if (!isValidString(user_id) || !isValidString(streamer_id)) {
      console.error(
        `Invalid input in getMessage: user_id=[${user_id}], streamer_id=[${streamer_id}]`
      );
      return null;
    }
    const userRef = this._db.collection("users").doc(user_id);
    const doc = await userRef.get();
    if (doc.exists) {
      const streamer = doc
        .data()
        ["streamers"].find((s) => s.streamer_id === streamer_id);

      if (streamer) {
        return streamer.notification_message;
      }
      console.error(
        `Error : Streamer [${streamer_id}] not found for user [${user_id}]`
      );
      return "";
    } else {
      console.error(`Error : User [${user_id}] not found`);
      return "";
    }
  }

  async setMessage(user_id, streamer_id, notification_message = "") {
    if (typeof notification_message !== "string") {
      const msg = `Notification message must be a string. Received: ${typeof notification_message}`;
      console.error(msg);
      return { success: false, reason: "invalid_message_type", message: msg };
    }

    if (!isValidString(user_id) || !isValidString(streamer_id)) {
      const msg = `Invalid input in setMessage: user_id=[${user_id}], streamer_id=[${streamer_id}], notification_message=[${notification_message}]`;
      console.error(msg);
      return { success: false, reason: "invalid_input", message: msg };
    }

    try {
      const userRef = this._db.collection("users").doc(user_id);
      const doc = await userRef.get();

      if (!doc.exists) {
        const msg = `User [${user_id}] not found`;
        console.error(msg);
        return { success: false, reason: "user_not_found", message: msg };
      }

      const streamers = doc.data()["streamers"];
      const index = streamers.findIndex((s) => s.streamer_id === streamer_id);

      if (index === -1) {
        const msg = `Streamer [${streamer_id}] not found for user [${user_id}]`;
        console.error(msg);
        return { success: false, reason: "streamer_not_found", message: msg };
      }

      // Update the notification message
      streamers[index] = {
        streamer_id,
        notification_message,
      };

      await userRef.update({ streamers });

      return { success: true };
    } catch (error) {
      console.error(
        `Error setting message for user [${user_id}] and streamer [${streamer_id}]`,
        error
      );
      return { success: false, reason: "exception", error };
    }
  }
}
module.exports = { FirestoreWrapper };
