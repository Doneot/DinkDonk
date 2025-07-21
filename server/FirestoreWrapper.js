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
  constructor() {
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

    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    this._db = getFirestore();
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

  async addUser(user_id) {
    if (!isValidString(user_id)) {
      console.error(`Invalid user_id: [${user_id}]`);
      return;
    }
    try {
      await this._db
        .collection("users")
        .doc(user_id)
        .set({ user_id, canReceiveDM: false, streamers: [] });
    } catch (error) {
      console.error("Error adding user:", error);
    }
  }

  async updateUserDMability(user_id, canReceiveDM) {
    if (!isValidString(user_id)) {
      console.error(`Invalid user_id: [${user_id}]`);
      return;
    }
    try {
      const userRef = this._db.collection("users").doc(user_id);
      await userRef.update({ canReceiveDM });
    } catch (error) {
      console.error("Error updating user:", user_id, error);
    }
  }

  async updateUserTokens(user_id, access_token, refresh_token, fetchTime) {
    if (!isValidString(user_id)) {
      console.error(`Invalid user_id: [${user_id}]`);
      return;
    }
    try {
      const userRef = this._db.collection("users").doc(user_id);
      await userRef.update({ access_token, refresh_token, fetchTime });
    } catch (error) {
      console.error("Error updating user:", user_id, error);
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

  async subscribe(user_id, streamer_id, notification_message = "") {
    if (!isValidString(user_id) || !isValidString(streamer_id)) {
      console.error(
        `Invalid input in subscribe: user_id=[${user_id}], streamer_id=[${streamer_id}], message=[${notification_message}]`
      );
      return;
    }
    try {
      const userRef = this._db.collection("users").doc(user_id);
      let userDoc = await userRef.get();
      if (!userDoc.exists) {
        await this.addUser(user_id);
        userDoc = await userRef.get();
      }
      let streamerAlreadyRegisteredForUser = false;
      for (const streamer of userDoc.data()["streamers"]) {
        if (streamer["streamer_id"] === streamer_id) {
          streamerAlreadyRegisteredForUser = true;
          console.error(
            `Error, the streamer [${streamer_id}] is already registered for user [${user_id}]`
          );
          break;
        }
      }
      if (!streamerAlreadyRegisteredForUser) {
        await userRef.update({
          streamers: admin.firestore.FieldValue.arrayUnion({
            streamer_id,
            notification_message,
          }),
        });
      }
      const streamerRef = this._db.collection("streamers").doc(streamer_id);
      let streamerDoc = await streamerRef.get();
      if (!streamerDoc.exists) {
        await this._addStreamer(streamer_id);
        streamerDoc = await streamerRef.get();
      }
      let userAlreadyRegisteredForStreamer = false;
      for (const user of streamerDoc.data()["users"]) {
        if (user === user_id) {
          userAlreadyRegisteredForStreamer = true;
          console.error(
            `Error, the streamer [${streamer_id}] is already registered for user [${user_id}]`
          );
          break;
        }
      }
      if (!userAlreadyRegisteredForStreamer) {
        await streamerRef.update({
          users: admin.firestore.FieldValue.arrayUnion(user_id),
        });
      }
    } catch (error) {
      console.error(
        `Error subscribing user [${user_id}] to streamer [${streamer_id}]`,
        error
      );
    }
  }

  async unsubscribe(user_id, streamer_id) {
    if (!isValidString(user_id) || !isValidString(streamer_id)) {
      console.error(
        `Invalid input in unsubscribe: user_id=[${user_id}], streamer_id=[${streamer_id}]`
      );
      return;
    }
    try {
      const userRef = this._db.collection("users").doc(user_id);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        const streamers = userDoc.data()["streamers"];
        await userRef.update({
          streamers: streamers.filter(
            (streamer) => streamer["streamer_id"] !== streamer_id
          ),
        });
      } else {
        console.error(`Error : no user found for id [${user_id}]`);
      }
      const streamerRef = this._db.collection("streamers").doc(streamer_id);
      const streamerDoc = await streamerRef.get();
      if (streamerDoc.exists) {
        await streamerRef.update({
          users: admin.firestore.FieldValue.arrayRemove(user_id),
        });
      } else {
        console.error(`Error : no streamer found for id [${streamer_id}]`);
      }
    } catch (error) {
      console.error(
        `Error unsubscribing user [${user_id}] from streamer [${streamer_id}]`,
        error
      );
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
    if (typeof notification_message === "string") {
      if (!isValidString(user_id) || !isValidString(streamer_id)) {
        console.error(
          `Invalid input in setMessage: user_id=[${user_id}], streamer_id=[${streamer_id}], notification_message=[${notification_message}]`
        );
        return null;
      }
      const userRef = this._db.collection("users").doc(user_id);
      const doc = await userRef.get();
      if (doc.exists) {
        const streamers = doc.data()["streamers"];
        const index = streamers.findIndex((s) => s.streamer_id === streamer_id);

        if (index === -1) {
          console.error(
            `Error : Streamer [${streamer_id}] not found for user [${user_id}]`
          );
          return;
        }

        streamers[index] = {
          streamer_id,
          notification_message,
        };
        await userRef.update({ streamers: streamers });
      } else {
        console.error(`Error : User [${user_id}] not found`);
      }
    }
  }
}
module.exports = { FirestoreWrapper };
