import type {
  Firestore,
  CollectionReference,
  DocumentData,
} from "firebase-admin/firestore";

import type { StreamerRepository } from "../../ports/StreamerRepository.js";
import type { Streamer } from "../../domain/Streamer.js";
import type { DomainEventBus } from "../../../../shared/events/DomainEventBus.js";
import { StreamerSchema } from "../../schemas/StreamerSchema.js";
import { isNonEmptyString } from "../../../../shared/utils/validators.js";
import { getExistingDoc } from "../../../../shared/utils/firestore.js";
import { logger } from "../../../../shared/logger/logger.js";

export class FirestoreStreamerRepository implements StreamerRepository {
  // Mirrors FirestoreUserRepository.GET_ALL_CHUNK_SIZE: Firestore#getAll has
  // no hard documented cap, but chunking keeps each RPC's payload/latency
  // bounded regardless of how many ids a caller passes in one call.
  private static readonly GET_ALL_CHUNK_SIZE = 300;

  private readonly db: Firestore;
  private readonly streamers: CollectionReference<DocumentData>;

  constructor(
    db: Firestore,
    readonly events: DomainEventBus,
  ) {
    this.db = db;
    this.streamers = db.collection("streamers");
  }

  async getStreamers(limit?: number): Promise<Streamer[]> {
    const query = limit === undefined ? this.streamers : this.streamers.limit(limit);
    const snapshot = await query.get();

    return snapshot.docs.map((doc) => this.toStreamer(doc.id, doc.data()));
  }

  async getStreamer(id: string): Promise<Streamer | null> {
    const doc = await getExistingDoc(this.streamers, id);

    return doc ? this.toStreamer(doc.id, doc.data() ?? {}) : null;
  }

  async getStreamersByIds(ids: string[]): Promise<Streamer[]> {
    const uniqueIds = [...new Set(ids.filter(isNonEmptyString))];

    if (uniqueIds.length === 0) {
      return [];
    }

    const streamers: Streamer[] = [];

    for (
      let i = 0;
      i < uniqueIds.length;
      i += FirestoreStreamerRepository.GET_ALL_CHUNK_SIZE
    ) {
      const chunk = uniqueIds.slice(
        i,
        i + FirestoreStreamerRepository.GET_ALL_CHUNK_SIZE,
      );
      const refs = chunk.map((id) => this.streamers.doc(id));
      const docs = await this.db.getAll(...refs);

      for (const doc of docs) {
        if (doc.exists) {
          streamers.push(this.toStreamer(doc.id, doc.data() ?? {}));
        }
      }
    }

    return streamers;
  }

  private toStreamer(id: string, data: DocumentData): Streamer {
    const record = StreamerSchema.parse({ ...data, id });

    return {
      id,
      isLive: record.isLive,
      liveSince: record.liveSince,
    };
  }

  async createStreamer(id: string): Promise<void> {
    // Matches every sibling method's guard (isNonEmptyString), plus the id
    // length cap StreamerSchema enforces on read - so a document that could
    // never have validly come from a read also can't be written here.
    if (!isNonEmptyString(id) || !StreamerSchema.shape.id.safeParse(id).success) {
      return;
    }

    const streamerRef = this.streamers.doc(id);

    // Transactional read-before-write (not a separate .get() then .set())
    // so the "did this create a new streamer" check can't race a concurrent
    // caller the way two independent calls could - mirrors
    // FirestoreUserRepository.subscribe()'s createdStreamer guard,
    // which this previously didn't match: an unconditional emit here meant
    // calling createStreamer on an already-existing streamer fired a
    // spurious streamerAdded event.
    const created = await this.streamers.firestore.runTransaction(
      async (tx) => {
        const doc = await tx.get(streamerRef);

        tx.set(streamerRef, { id }, { merge: true });

        return !doc.exists;
      },
    );

    // Same known, accepted debt as FirestoreUserRepository.subscribe()'s
    // identical decision - see ARCHITECTURE.md's modules/ section.
    if (created) {
      this.events.emit({ type: "streamerAdded", streamerId: id });
    }
  }

  async deleteStreamer(id: string): Promise<void> {
    if (!isNonEmptyString(id)) return;

    // Unlike a bare `.delete()`, this cascades the `subscribers`
    // subcollection in the same transaction as the streamer doc itself, so
    // a hard delete here can't leave orphaned subscriber documents behind
    // (dangling references a future `getSubscriberIds`/re-created streamer
    // could otherwise pick back up). There are currently no production
    // callers of this method - deleteStreamerIfEmpty is what's actually
    // used - but it's kept safe rather than removed since it's still
    // exercised by tests as a distinct hard-delete capability.
    const streamerRef = this.streamers.doc(id);
    const subscribersRef = this.subscribersOf(id);

    await this.streamers.firestore.runTransaction(async (tx) => {
      const subscribersSnapshot = await tx.get(subscribersRef);

      for (const doc of subscribersSnapshot.docs) {
        tx.delete(subscribersRef.doc(doc.id));
      }

      tx.delete(streamerRef);
    });

    logger.info({ streamerId: id }, "Deleted streamer");
  }

  async getSubscriberIds(id: string): Promise<string[]> {
    if (!isNonEmptyString(id)) return [];

    const snapshot = await this.subscribersOf(id).get();

    return snapshot.docs.map((doc) => doc.id);
  }

  async deleteStreamerIfEmpty(id: string): Promise<boolean> {
    if (!isNonEmptyString(id)) return false;

    const streamerRef = this.streamers.doc(id);
    const subscribersRef = this.subscribersOf(id);

    return this.streamers.firestore.runTransaction(async (tx) => {
      // An aggregate count avoids transferring every subscriber document
      // just to answer a yes/no emptiness question.
      const countSnapshot = await tx.get(subscribersRef.count());

      if (countSnapshot.data().count > 0) {
        return false;
      }

      tx.delete(streamerRef);

      return true;
    });
  }

  async setLiveState(
    id: string,
    isLive: boolean,
    liveSince: string | null,
  ): Promise<boolean> {
    if (!isNonEmptyString(id)) return false;

    const streamerRef = this.streamers.doc(id);

    return this.streamers.firestore.runTransaction(async (tx) => {
      const doc = await tx.get(streamerRef);

      if (!doc.exists) {
        return false;
      }

      tx.set(streamerRef, { isLive, liveSince }, { merge: true });

      return true;
    });
  }

  private subscribersOf(id: string): CollectionReference<DocumentData> {
    return this.streamers.doc(id).collection("subscribers");
  }
}
