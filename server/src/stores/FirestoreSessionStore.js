const session = require('express-session');

class FirestoreSessionStore extends session.Store {
  constructor(firestore, { collectionName = 'sessions' } = {}) {
    super();
    this.collection = firestore.collection(collectionName);
  }

  async get(sessionId, callback) {
    try {
      const snapshot = await this.collection.doc(sessionId).get();
      if (!snapshot.exists) {
        callback(null, null);
        return;
      }

      const data = snapshot.data();
      callback(null, data?.session ? JSON.parse(data.session) : null);
    } catch (error) {
      callback(error);
    }
  }

  async set(sessionId, sessionData, callback = () => {}) {
    try {
      await this.collection.doc(sessionId).set({
        session: JSON.stringify(sessionData),
        updatedAt: Date.now(),
      });
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  async destroy(sessionId, callback = () => {}) {
    try {
      await this.collection.doc(sessionId).delete();
      callback(null);
    } catch (error) {
      callback(error);
    }
  }
}

module.exports = { FirestoreSessionStore };
