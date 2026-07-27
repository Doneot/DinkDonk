import type { SessionData } from "express-session";
import { describe, expect, it, vi } from "vitest";

import { FirestoreSessionRepository } from "../../../modules/auth/infrastructure/firestore/FirestoreSessionRepository.js";

import { FakeFirestore } from "../../helpers/fakeFirestore.js";

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

  it("honours a custom collection name", async () => {
    const { firestore, store } = setup("custom-sessions");

    await call((callback) => store.set("session-1", SESSION, callback));

    expect(firestore.read("custom-sessions/session-1")).toBeDefined();
  });
});
