import type { SessionData } from "express-session";
import { describe, expect, it, vi } from "vitest";

import { FirestoreSessionRepository } from "../../../modules/auth/infrastructure/firestore/FirestoreSessionRepository.js";
import { logger } from "../../../shared/logger/logger.js";
import { FakeDocumentReference, FakeFirestore } from "../../helpers/fakeFirestore.js";
import { anyNumber } from "../../helpers/matchers.js";

const SESSION: SessionData = {
  cookie: { originalMaxAge: 3_600_000 },
  canReceiveDM: true,
};

function setup(collectionName?: string) {
  const firestore = new FakeFirestore();

  return {
    firestore,
    store: new FirestoreSessionRepository(
      firestore.asFirestore(),
      collectionName ? { collectionName } : {},
    ),
  };
}

function get(
  store: FirestoreSessionRepository,
  sessionId: string,
): Promise<SessionData | null | undefined> {
  return new Promise((resolve, reject) => {
    store.get(sessionId, (error, data) => {
      if (error) {
        reject(error);

        return;
      }

      resolve(data);
    });
  });
}

function call(
  operation: (callback: (error: Error | null) => void) => Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    void operation((error) => {
      if (error) {
        reject(error);

        return;
      }

      resolve();
    });
  });
}

// touch()'s callback has no error parameter - unlike set/destroy, a touch
// failure is logged and swallowed rather than surfaced, so this just
// resolves once the callback fires either way.
function touch(
  store: FirestoreSessionRepository,
  sessionId: string,
  sessionData: SessionData,
): Promise<void> {
  return new Promise((resolve) => {
    store.touch(sessionId, sessionData, resolve);
  });
}

describe("FirestoreSessionRepository", () => {
  it("stores a session as serialized JSON", async () => {
    const { firestore, store } = setup();

    await call((callback) => store.set("session-1", SESSION, callback));

    expect(firestore.read("sessions/session-1")).toMatchObject({
      session: JSON.stringify(SESSION),
      updatedAt: anyNumber,
    });
  });

  it("reads a stored session back", async () => {
    const { store } = setup();

    await call((callback) => store.set("session-1", SESSION, callback));

    await expect(get(store, "session-1")).resolves.toEqual(SESSION);
  });

  it("returns null for an unknown session", async () => {
    const { store } = setup();

    await expect(get(store, "session-1")).resolves.toBeNull();
  });

  it("returns null when the document holds no session payload", async () => {
    const { firestore, store } = setup();

    firestore.write("sessions/session-1", { updatedAt: 1 });

    await expect(get(store, "session-1")).resolves.toBeNull();
  });

  it("reports a read failure through the callback", async () => {
    const firestore = new FakeFirestore();

    vi.spyOn(firestore, "collection").mockReturnValue({
      doc: () => ({
        get: () => Promise.reject(new Error("firestore unavailable")),
      }),
    } as unknown as ReturnType<FakeFirestore["collection"]>);

    const store = new FirestoreSessionRepository(firestore.asFirestore());

    await expect(get(store, "session-1")).rejects.toThrow(
      "firestore unavailable",
    );

    vi.restoreAllMocks();
  });

  it("reports a write failure through the callback", async () => {
    const { firestore, store } = setup();

    vi.spyOn(firestore, "write").mockImplementation(() => {
      throw new Error("firestore unavailable");
    });

    await expect(
      call((callback) => store.set("session-1", SESSION, callback)),
    ).rejects.toThrow("firestore unavailable");

    vi.restoreAllMocks();
  });

  it("destroys a stored session", async () => {
    const { firestore, store } = setup();

    await call((callback) => store.set("session-1", SESSION, callback));
    await call((callback) => store.destroy("session-1", callback));

    expect(firestore.read("sessions/session-1")).toBeUndefined();
  });

  it("reports a destroy failure through the callback", async () => {
    const { firestore, store } = setup();

    vi.spyOn(firestore, "remove").mockImplementation(() => {
      throw new Error("firestore unavailable");
    });

    await expect(
      call((callback) => store.destroy("session-1", callback)),
    ).rejects.toThrow("firestore unavailable");

    vi.restoreAllMocks();
  });

  it("returns null and deletes the document for an expired session", async () => {
    const { firestore, store } = setup();

    const expiredSession: SessionData = {
      cookie: {
        originalMaxAge: 3_600_000,
        expires: new Date(Date.now() - 60_000),
      },
      canReceiveDM: true,
    };

    await call((callback) => store.set("session-1", expiredSession, callback));

    await expect(get(store, "session-1")).resolves.toBeNull();

    await vi.waitFor(() => {
      expect(firestore.read("sessions/session-1")).toBeUndefined();
    });
  });

  it("returns a session whose cookie has not yet expired", async () => {
    const { store } = setup();

    const freshSession: SessionData = {
      cookie: {
        originalMaxAge: 3_600_000,
        expires: new Date(Date.now() + 3_600_000),
      },
      canReceiveDM: true,
    };

    await call((callback) => store.set("session-1", freshSession, callback));

    await expect(get(store, "session-1")).resolves.toEqual(
      JSON.parse(JSON.stringify(freshSession)),
    );
  });

  it("honours a custom collection name", async () => {
    const { firestore, store } = setup("custom-sessions");

    await call((callback) => store.set("session-1", SESSION, callback));

    expect(firestore.read("custom-sessions/session-1")).toBeDefined();
  });

  describe("purgeExpiredSessions", () => {
    it("deletes only sessions past their expiry", async () => {
      const { firestore, store } = setup();

      await call((callback) =>
        store.set(
          "expired-1",
          {
            cookie: {
              originalMaxAge: 3_600_000,
              expires: new Date(Date.now() - 60_000),
            },
          },
          callback,
        ),
      );
      await call((callback) =>
        store.set(
          "expired-2",
          {
            cookie: {
              originalMaxAge: 3_600_000,
              expires: new Date(Date.now() - 1_000),
            },
          },
          callback,
        ),
      );
      await call((callback) =>
        store.set(
          "fresh-1",
          {
            cookie: {
              originalMaxAge: 3_600_000,
              expires: new Date(Date.now() + 3_600_000),
            },
          },
          callback,
        ),
      );

      await expect(store.purgeExpiredSessions()).resolves.toBe(2);

      expect(firestore.read("sessions/expired-1")).toBeUndefined();
      expect(firestore.read("sessions/expired-2")).toBeUndefined();
      expect(firestore.read("sessions/fresh-1")).toBeDefined();
    });

    it("returns 0 when nothing is expired", async () => {
      const { store } = setup();

      await call((callback) =>
        store.set(
          "fresh-1",
          {
            cookie: {
              originalMaxAge: 3_600_000,
              expires: new Date(Date.now() + 3_600_000),
            },
          },
          callback,
        ),
      );

      await expect(store.purgeExpiredSessions()).resolves.toBe(0);
    });

    it("ignores a session document with no expiresAt field", async () => {
      const { firestore, store } = setup();

      firestore.write("sessions/no-expiry", { updatedAt: 1 });

      await expect(store.purgeExpiredSessions()).resolves.toBe(0);
      expect(firestore.read("sessions/no-expiry")).toBeDefined();
    });
  });

  describe("touch", () => {
    it("refreshes updatedAt/expiresAt via merge without disturbing the stored session blob", async () => {
      const { firestore, store } = setup();

      await call((callback) => store.set("session-1", SESSION, callback));

      const touchedSession: SessionData = {
        ...SESSION,
        cookie: {
          ...SESSION.cookie,
          expires: new Date(Date.now() + 7_200_000),
        },
      };

      await touch(store, "session-1", touchedSession);

      expect(firestore.read("sessions/session-1")).toMatchObject({
        // The original set() call's serialized blob is untouched - touch()
        // only refreshes the expiry-related fields, it doesn't re-serialize
        // the session data (that's what set() is for).
        session: JSON.stringify(SESSION),
        updatedAt: anyNumber,
        expiresAt: touchedSession.cookie.expires!.getTime(),
      });
    });

    it("invokes the callback on success", async () => {
      const { store } = setup();

      await call((callback) => store.set("session-1", SESSION, callback));

      await expect(touch(store, "session-1", SESSION)).resolves.toBeUndefined();
    });

    it("logs and still invokes the callback when the write fails", async () => {
      const error = vi.spyOn(logger, "error").mockReturnValue();
      const { store } = setup();

      // A rejected promise (not a synchronous throw): touch() chains
      // .then()/.catch() directly onto set()'s return value rather than
      // wrapping it in try/catch, so this exercises the real Firestore SDK's
      // actual failure shape (an async rejection) rather than a same-tick
      // throw that would never reach that .catch() at all.
      vi.spyOn(FakeDocumentReference.prototype, "set").mockRejectedValueOnce(
        new Error("firestore unavailable"),
      );

      await expect(touch(store, "session-1", SESSION)).resolves.toBeUndefined();

      expect(error).toHaveBeenCalledWith(
        {
          sessionId: "session-1",
          error: expect.any(Error) as Error,
        },
        "Failed to touch session document",
      );

      vi.restoreAllMocks();
    });
  });
});
