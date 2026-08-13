import { describe, expect, it, vi } from "vitest";

import { UserChangeBroadcaster } from "../../../../modules/users/application/UserChangeBroadcaster.js";
import type { User } from "../../../../modules/users/domain/User.js";
import type { UserRepository } from "../../../../modules/users/ports/UserRepository.js";
import type { SocketServer } from "../../../../realtime/socketServer.js";
import { logger } from "../../../../shared/logger/logger.js";

type ChangeListener = (user: User) => void;
type ErrorListener = (error: Error) => void;

function setup() {
  const unsubscribe = vi.fn();
  const changeListeners: ChangeListener[] = [];
  const errorListeners: ErrorListener[] = [];

  const watchUsers = vi.fn(
    (onChange: ChangeListener, onError: ErrorListener) => {
      changeListeners.push(onChange);
      errorListeners.push(onError);

      return unsubscribe;
    },
  );

  const userRepository = { watchUsers } as unknown as UserRepository;

  const notifyUser =
    vi.fn<(userId: string, event: string, payload: unknown) => void>();
  const socketServer = { notifyUser } as unknown as SocketServer;

  return {
    unsubscribe,
    watchUsers,
    notifyUser,
    emit: (user: User) => {
      for (const listener of changeListeners) {
        listener(user);
      }
    },
    emitError: (error: Error) => {
      for (const onError of errorListeners) {
        onError(error);
      }
    },
    listenerCount: () => changeListeners.length,
    broadcaster: new UserChangeBroadcaster(userRepository, socketServer),
  };
}

const baseUser: User = {
  id: "user-1",
  canReceiveDM: true,
  subscriptions: [{ id: "streamer-1", notification_message: "hi" }],
};

describe("UserChangeBroadcaster", () => {
  it("watches for user changes on start", () => {
    const { broadcaster, watchUsers } = setup();

    broadcaster.start();

    expect(watchUsers).toHaveBeenCalledOnce();
  });

  it("pushes a changed user to their owning socket", () => {
    const { broadcaster, emit, notifyUser } = setup();

    broadcaster.start();

    emit(baseUser);

    expect(notifyUser.mock.calls).toEqual([
      ["user-1", "user_data_updated", baseUser],
    ]);
  });

  it("forwards every user reported in turn", () => {
    const { broadcaster, emit, notifyUser } = setup();

    broadcaster.start();

    emit(baseUser);
    emit({ ...baseUser, id: "user-2" });

    expect(notifyUser.mock.calls.map((call) => call[0])).toEqual([
      "user-1",
      "user-2",
    ]);
  });

  it("logs when the change listener itself errors", () => {
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
