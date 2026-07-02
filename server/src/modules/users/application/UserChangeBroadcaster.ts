import type { SocketServer } from "../../../realtime/socketServer.js";
import type { Firestore } from "firebase-admin/firestore";

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

    this.unsubscribe = this.firestore
      .collection("users")
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "modified") {
            this.socketServer.notifyUser(
              change.doc.id,
              "user_data_updated",
              change.doc.data(),
            );
          }
        });
      });
  }

  stop(): void {
    this.unsubscribe?.();

    this.unsubscribe = null;
  }
}
