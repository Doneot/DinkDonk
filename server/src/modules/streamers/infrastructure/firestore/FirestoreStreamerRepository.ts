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
  private readonly streamers: CollectionReference<DocumentData>;

  constructor(
    db: Firestore,
    readonly events: DomainEventBus,
  ) {
    this.streamers = db.collection("streamers");
  }

  async getStreamers(): Promise<Streamer[]> {
    const snapshot = await this.streamers.get();

    return snapshot.docs.map((doc) => ({ id: doc.id }));
  }

  async getStreamer(id: string): Promise<Streamer | null> {
    const doc = await getExistingDoc(this.streamers, id);

    return doc ? { id: doc.id } : null;
  }

  async createStreamer(id: string): Promise<void> {
    // Matches every sibling method's guard (isNonEmptyString), plus the id
    // length cap StreamerSchema enforces on read - so a document that could
    // never have validly come from a read also can't be written here.
    if (!isNonEmptyString(id) || !StreamerSchema.shape.id.safeParse(id).success) {
      return;
    }

    await this.streamers.doc(id).set({ id }, { merge: true });

    this.events.emit({ type: "streamerAdded", streamerId: id });
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

    logger.info(`Deleted streamer ${id}`);
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

  private subscribersOf(id: string): CollectionReference<DocumentData> {
    return this.streamers.doc(id).collection("subscribers");
  }
}
