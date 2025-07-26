// server/FireSessionStore.js
const session = require("express-session");
const { Timestamp } = require("firebase-admin/firestore");

class FirestoreSessionStore extends session.Store {
  constructor(
    firestoreDb,
    { enableTTL = false, defaultTTL = 60 * 60 * 1000 } = {}
  ) {
    super();
    this._db = firestoreDb;
    this._collection = this._db.collection("sessions");
    this.enableTTL = enableTTL;
    this.defaultTTL = defaultTTL;
  }

  async set(sid, session, callback) {
    try {
      const sessionData = JSON.parse(JSON.stringify(session));
      const dataToStore = { session: sessionData };

      if (this.enableTTL) {
        const now = Date.now();
        const ttlMs = session.cookie?.maxAge ?? this.defaultTTL;
        const expiresAt = new Date(now + ttlMs);
        dataToStore.expiresAt = Timestamp.fromDate(expiresAt);
      }

      await this._collection.doc(sid).set(dataToStore);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  async get(sid, callback) {
    try {
      const doc = await this._collection.doc(sid).get();
      if (!doc.exists) return callback(null, null);

      const data = doc.data();

      if (this.enableTTL && data.expiresAt?.toMillis() < Date.now()) {
        await this.destroy(sid, () => {});
        return callback(null, null);
      }

      callback(null, data.session);
    } catch (err) {
      callback(err);
    }
  }

  async destroy(sid, callback) {
    try {
      await this._collection.doc(sid).delete();
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
}

module.exports = FirestoreSessionStore;
