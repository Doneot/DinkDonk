import session from "express-session";
import type { Firestore } from "firebase-admin/firestore";

import { logger } from "../../../../shared/logger/logger.js";

type StoreCallback<T = unknown> = (
  error: Error | null,
  data?: T | null,
) => void;

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

        const data = snapshot.data() as { session?: unknown } | undefined;
        const sessionJson =
          typeof data?.session === "string" ? data.session : null;
        const sessionData = sessionJson
          ? (JSON.parse(sessionJson) as session.SessionData)
          : null;

        if (sessionData && this.isExpired(sessionData)) {
          // The cookie's maxAge has elapsed; treat it as if it never
          // existed and clean up the now-useless document rather than
          // letting expired session docs accumulate forever.
          this.collection
            .doc(sessionId)
            .delete()
            .catch((error: unknown) => {
              logger.error(
                { sessionId, error },
                "Failed to delete expired session document",
              );
            });

          callback(null, null);
          return;
        }

        callback(null, sessionData);
      })
      .catch((error) => {
        callback(error as Error);
      });
  }

  private isExpired(sessionData: session.SessionData): boolean {
    const expires = sessionData.cookie?.expires;

    if (!expires) {
      return false;
    }

    const expiresAt = new Date(expires).getTime();

    return Number.isFinite(expiresAt) && expiresAt <= Date.now();
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
      callback(error as Error);
    }
  }

  async destroy(sessionId: string, callback: StoreCallback): Promise<void> {
    try {
      await this.collection.doc(sessionId).delete();
      callback(null);
    } catch (error) {
      callback(error as Error);
    }
  }
}
