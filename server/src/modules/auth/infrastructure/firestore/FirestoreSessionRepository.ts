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

        const data = snapshot.data() as
          | { session?: unknown; expiresAt?: unknown }
          | undefined;
        const sessionJson =
          typeof data?.session === "string" ? data.session : null;

        let sessionData: session.SessionData | null = null;

        if (sessionJson) {
          try {
            sessionData = JSON.parse(sessionJson) as session.SessionData;
          } catch (error) {
            // A corrupt session blob is treated the same as "no session
            // found" rather than surfacing as a hard error through
            // express-session - a bad cookie/session shouldn't turn into a
            // request-failing 500.
            logger.error(
              { sessionId, error },
              "Failed to parse stored session JSON; treating as missing",
            );
            callback(null, null);
            return;
          }
        }

        // The top-level expiresAt field (written by set()/touch()) is the
        // preferred source of truth once present - it's what a future
        // cleanup sweep would query on. A document written before this
        // field existed won't have it, so fall back to parsing the expiry
        // out of the serialized blob rather than treating a missing field
        // as "already expired".
        const storedExpiresAt =
          typeof data?.expiresAt === "number" ? data.expiresAt : null;

        if (
          sessionData &&
          this.isExpired(sessionData, storedExpiresAt)
        ) {
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

  private isExpired(
    sessionData: session.SessionData,
    storedExpiresAt?: number | null,
  ): boolean {
    const expiresAt = storedExpiresAt ?? this.resolveExpiresAt(sessionData);

    return expiresAt !== null && expiresAt <= Date.now();
  }

  /** Derives a queryable epoch-millis expiry from the cookie's `expires`. */
  private resolveExpiresAt(sessionData: session.SessionData): number | null {
    const expires = sessionData.cookie?.expires;

    if (!expires) {
      return null;
    }

    const expiresAt = new Date(expires).getTime();

    return Number.isFinite(expiresAt) ? expiresAt : null;
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
        // Native top-level field mirroring the expiry trapped inside the
        // serialized `session` blob, so a future cleanup job can query
        // `WHERE expiresAt < now()` for abandoned sessions without having to
        // deserialize every document in the collection.
        expiresAt: this.resolveExpiresAt(sessionData),
      });

      callback(null);
    } catch (error) {
      callback(error as Error);
    }
  }

  /**
   * Lightweight counterpart to set(): only refreshes the expiry-related
   * fields instead of re-serializing and rewriting the entire session blob,
   * so a rolling session's per-request touch stays cheap. Without this, an
   * express-session Store falls back to its (no-op) inherited touch, which
   * `resave`/`rolling` configurations rely on stores implementing
   * themselves to actually extend the persisted expiry.
   */
  touch(
    sessionId: string,
    sessionData: session.SessionData,
    callback?: () => void,
  ): void {
    this.collection
      .doc(sessionId)
      .set(
        {
          updatedAt: Date.now(),
          expiresAt: this.resolveExpiresAt(sessionData),
        },
        { merge: true },
      )
      .then(() => callback?.())
      .catch((error: unknown) => {
        logger.error({ sessionId, error }, "Failed to touch session document");
        callback?.();
      });
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
