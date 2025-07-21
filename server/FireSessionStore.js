const session = require("express-session");

class FirestoreSessionStore extends session.Store {
  constructor(firestoreDb) {
    super();
    this._db = firestoreDb;
    this._collection = this._db.collection("sessions");
  }

  async set(sid, session, callback) {
    try {
      // Convert session object to plain JSON
      const sessionData = JSON.parse(JSON.stringify(session));
      await this._collection.doc(sid).set({ session: sessionData });
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  async get(sid, callback) {
    try {
      const doc = await this._collection.doc(sid).get();
      if (!doc.exists) return callback(null, null);
      // Return plain JSON session object
      return callback(null, doc.data().session);
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
