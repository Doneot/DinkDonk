import session from "express-session";
import type { Firestore } from "firebase-admin/firestore";

type StoreCallback<T = unknown> = (err?: unknown, data?: T | null) => void;

export class FirestoreSessionRepository extends session.Store {
  private readonly collection: ReturnType<Firestore["collection"]>;

  constructor(
    firestore: Firestore,
    { collectionName = "sessions" }: { collectionName?: string } = {},
  ) {
    super();
    this.collection = firestore.collection(collectionName);
  }

  get(sessionId: string, callback: StoreCallback<session.SessionData>): void {
    this.collection
      .doc(sessionId)
      .get()
      .then((snapshot) => {
        if (!snapshot.exists) {
          callback(null, null);
          return;
        }

        const data = snapshot.data();
        callback(null, data?.session ? JSON.parse(data.session) : null);
      })
      .catch((error) => {
        callback(error);
      });
  }

  async set(
    sessionId: string,
    sessionData: session.SessionData,
    callback: StoreCallback,
  ): Promise<void> {
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

  async destroy(sessionId: string, callback: StoreCallback): Promise<void> {
    try {
      await this.collection.doc(sessionId).delete();
      callback(null);
    } catch (error) {
      callback(error);
    }
  }
}
