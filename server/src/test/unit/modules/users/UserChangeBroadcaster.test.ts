import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import { UserChangeBroadcaster } from "../../../../modules/users/application/UserChangeBroadcaster.js";
import type { SocketServer } from "../../../../realtime/socketServer.js";
import { logger } from "../../../../shared/logger/logger.js";

type DocChange = {
  type: "added" | "modified" | "removed";
  doc: { id: string; data: () => Record<string, unknown> };
};

type SnapshotListener = (snapshot: { docChanges: () => DocChange[] }) => void;
type SnapshotErrorListener = (error: Error) => void;

function docChange(
  type: DocChange["type"],
  id: string,
  data: Record<string, unknown> = {},
): DocChange {
  return { type, doc: { id, data: () => data } };
}

function setup() {
  const unsubscribe = vi.fn();
  const listeners: SnapshotListener[] = [];
  const errorListeners: SnapshotErrorListener[] = [];
  const collection = vi.fn().mockReturnValue({
    onSnapshot: (
      listener: SnapshotListener,
      onError?: SnapshotErrorListener,
    ) => {
      listeners.push(listener);

      if (onError) {
        errorListeners.push(onError);
      }

      return unsubscribe;
    },
  });

  const notifyUser =
    vi.fn<(userId: string, event: string, payload: unknown) => void>();
  const socketServer = { notifyUser } as unknown as SocketServer;

  return {
    unsubscribe,
    collection,
    notifyUser,
    emit: (...changes: DocChange[]) => {
      for (const listener of listeners) {
        listener({ docChanges: () => changes });
      }
    },
    emitError: (error: Error) => {
      for (const onError of errorListeners) {
        onError(error);
      }
    },
    listenerCount: () => listeners.length,
    broadcaster: new UserChangeBroadcaster(
      { collection } as unknown as Firestore,
      socketServer,
    ),
  };
}

describe("UserChangeBroadcaster", () => {
  it("listens to the users collection on start", () => {
    const { broadcaster, collection } = setup();

    broadcaster.start();

    expect(collection.mock.calls).toEqual([["users"]]);
  });

  it("pushes modified user documents to the owning socket, mapped through the domain schema", () => {
    const { broadcaster, emit, notifyUser } = setup();

    broadcaster.start();

    emit(
      docChange("modified", "user-1", {
        canReceiveDM: true,
        subscriptions: [{ id: "streamer-1", notification_message: "hi" }],
      }),
    );

    expect(notifyUser.mock.calls).toEqual([
      [
        "user-1",
        "user_data_updated",
        {
          id: "user-1",
          canReceiveDM: true,
          subscriptions: [{ id: "streamer-1", notification_message: "hi" }],
        },
      ],
    ]);
  });

  it.each(["added", "removed"] as const)("ignores %s documents", (type) => {
    const { broadcaster, emit, notifyUser } = setup();

    broadcaster.start();

    emit(docChange(type, "user-1"));

    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("forwards every modified document in a snapshot", () => {
    const { broadcaster, emit, notifyUser } = setup();

    broadcaster.start();

    emit(
      docChange("modified", "user-1"),
      docChange("added", "user-2"),
      docChange("modified", "user-3"),
    );

    expect(notifyUser.mock.calls.map((call) => call[0])).toEqual([
      "user-1",
      "user-3",
    ]);
  });

  it("logs and skips a document that fails schema validation instead of throwing", () => {
    const error = vi.spyOn(logger, "error").mockReturnValue();
    const { broadcaster, emit, notifyUser } = setup();

    broadcaster.start();

    expect(() =>
      emit(docChange("modified", "user-1", { canReceiveDM: "not-a-boolean" })),
    ).not.toThrow();

    expect(notifyUser).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
  });

  it("logs when the snapshot listener itself errors", () => {
    const error = vi.spyOn(logger, "error").mockReturnValue();
    const { broadcaster, emitError } = setup();

    broadcaster.start();

    emitError(new Error("firestore unavailable"));

    expect(error).toHaveBeenCalledWith(
      { error: expect.any(Error) as Error },
      "User change listener failed",
    );
  });

  it("does not attach a second listener when started twice", () => {
    const { broadcaster, listenerCount } = setup();

    broadcaster.start();
    broadcaster.start();

    expect(listenerCount()).toBe(1);
  });

  it("detaches the listener on stop", () => {
    const { broadcaster, unsubscribe } = setup();

    broadcaster.start();
    broadcaster.stop();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("tolerates stop before start", () => {
    const { broadcaster, unsubscribe } = setup();

    expect(() => broadcaster.stop()).not.toThrow();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it("can be restarted after being stopped", () => {
    const { broadcaster, listenerCount } = setup();

    broadcaster.start();
    broadcaster.stop();
    broadcaster.start();

    expect(listenerCount()).toBe(2);
  });
});
