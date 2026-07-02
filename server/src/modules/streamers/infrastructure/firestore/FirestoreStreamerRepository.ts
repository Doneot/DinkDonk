import { EventEmitter } from "node:events";
import type {
  Firestore,
  CollectionReference,
  DocumentData,
} from "firebase-admin/firestore";

import type { StreamerRepository } from "../../ports/StreamerRepository.js";
import type { Streamer } from "../../domain/Streamer.js";
import { isNonEmptyString } from "../../../../shared/utils/validators.js";
import { logger } from "../../../../shared/logger/logger.js";

export class FirestoreStreamerRepository
  extends EventEmitter
  implements StreamerRepository
{
  private readonly db: Firestore;
  private readonly streamers: CollectionReference<DocumentData>;

  constructor(db: Firestore) {
    super();

    this.db = db;
    this.streamers = db.collection("streamers");
  }

  async getStreamers(): Promise<Streamer[]> {
    const snapshot = await this.streamers.get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<Streamer, "id">),
    }));
  }

  async getStreamer(id: string): Promise<Streamer | null> {
    if (!isNonEmptyString(id)) return null;

    const doc = await this.streamers.doc(id).get();

    return doc.exists
      ? { id: doc.id, ...(doc.data() as Omit<Streamer, "id">) }
      : null;
  }

  async createStreamer(id: string): Promise<void> {
    await this.streamers.doc(id).set(
      {
        id: id,
        users: [],
      },
      { merge: true },
    );

    this.emit("streamerAdded", id);
  }

  async deleteStreamer(id: string): Promise<void> {
    if (!isNonEmptyString(id)) return;

    await this.streamers.doc(id).delete();

    logger.info(`Deleted streamer ${id}`);
  }
}
