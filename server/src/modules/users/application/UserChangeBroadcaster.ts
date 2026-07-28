import type { SocketServer } from "../../../realtime/socketServer.js";
import type { Firestore } from "firebase-admin/firestore";

import { UserRecordSchema } from "../infrastructure/firestore/records/UserRecord.js";
import { toUser } from "../infrastructure/firestore/mappers/userMapper.js";
import { logger } from "../../../shared/logger/logger.js";

export class UserChangeBroadcaster {
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly firestore: Firestore,
    private readonly socketServer: SocketServer,
  ) {}

  start(): void {
    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = this.firestore.collection("users").onSnapshot(
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type !== "modified") {
            return;
          }

          try {
            const record = UserRecordSchema.parse(change.doc.data());
            const user = toUser(change.doc.id, record);

            this.socketServer.notifyUser(
              user.id,
              "user_data_updated",
              user,
            );
          } catch (error) {
            logger.error(
              { error, userId: change.doc.id },
              "Failed to broadcast a malformed user record",
            );
          }
        });
      },
      (error) => {
        logger.error({ error }, "User change listener failed");
      },
    );
  }

  stop(): void {
    this.unsubscribe?.();

    this.unsubscribe = null;
  }
}
