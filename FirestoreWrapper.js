const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
require("dotenv").config();

// Your web app's Firebase configuration
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"), // Ensure correct formatting for multiline keys
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  universe_domain: "googleapis.com",
};

class FirestoreWrapper {
  /**
   * @param {TwitchWrapper} twitchWrapper
   */
  constructor(twitchWrapper) {
    // Initialize firestore database
    initializeApp({
      credential: cert(serviceAccount),
    });
    this._db = getFirestore();
    this._twitch = twitchWrapper;
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

  async getUsersToNotify(streamer) {
    try {
      const usersSnapshot = await this._db
        .collection("users")
        .where("streamers", "array-contains", streamer)
        .get();
      return usersSnapshot.docs.map((doc) => doc.data());
    } catch (error) {
      console.error("Error getting users to notify:", error);
      return [];
    }
  }

  async addUser({ username, id, streamers }) {
    try {
      await this._db
        .collection("users")
        .doc(id)
        .set({ username, id, streamers });
    } catch (error) {
      console.error("Error adding user:", error);
    }
  }

  async getMessage(streamerName) {
    try {
      const streamerDoc = await this._db
        .collection("streamers")
        .doc(streamerName)
        .get();
      return streamerDoc.data().message;
    } catch (error) {
      console.error("Error getting message:", error);
      return "";
    }
  }

  async setMessage(streamerName, message) {
    try {
      await this._db
        .collection("streamers")
        .doc(streamerName)
        .update({ message });
    } catch (error) {
      console.error("Error setting message:", error);
    }
  }

  async addStreamer(streamerName, message) {
    try {
      const streamer = (await this._twitch.getStreamer(streamerName))[0];
      await this._db.collection("streamers").doc(streamerName).set({
        name: streamerName,
        message,
        id: streamer["id"],
      });
    } catch (error) {
      console.error("Error adding streamer:", error);
    }
  }

  async addStreamerToUser(userName, streamerName) {
    try {
      const snapshot = await this._db
        .collection("users")
        .where("username", "==", userName)
        .get();
      if (snapshot.empty) {
        console.log("No matching documents.");
        return;
      }
      snapshot.forEach((doc) => {
        doc.ref.update({ streamers: FieldValue.arrayUnion(streamerName) });
      });
    } catch (error) {
      console.error("Error adding streamer to user:", error);
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
}

module.exports = { FirestoreWrapper };
