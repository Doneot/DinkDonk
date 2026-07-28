import type {
  Firestore,
  CollectionReference,
  DocumentData,
} from "firebase-admin/firestore";

import type { StreamerRepository } from "../../ports/StreamerRepository.js";
import type { Streamer } from "../../domain/Streamer.js";
import type { DomainEventBus } from "../../../../shared/events/DomainEventBus.js";
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
    await this.streamers.doc(id).set({ id }, { merge: true });

    this.events.emit({ type: "streamerAdded", streamerId: id });
  }

  async deleteStreamer(id: string): Promise<void> {
    if (!isNonEmptyString(id)) return;

    await this.streamers.doc(id).delete();

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
      const subscribers = await tx.get(subscribersRef);

      if (subscribers.docs.length > 0) {
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
