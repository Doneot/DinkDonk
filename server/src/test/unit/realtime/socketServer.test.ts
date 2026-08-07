import http from "node:http";
import type { RequestHandler } from "express";
import type { Redis } from "ioredis";
import type { Socket } from "socket.io";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSocketServer } from "../../../realtime/socketServer.js";
import type { SocketServer } from "../../../realtime/socketServer.js";
import { logger } from "../../../shared/logger/logger.js";
import { TokenDecryptionError } from "../../../shared/utils/crypto.js";
import { InMemoryIdentityRepository } from "../../repositories/inMemory/InMemoryIdentityRepository.js";
import { buildIdentity } from "../../builders/auth.js";

type FakeRedis = {
  duplicate: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  handlers: Map<string, (...args: unknown[]) => void>;
};

// Models the real ioredis contract this module depends on: a client used to
// publish can't also subscribe on the same connection, so duplicate() must
// return a second, independent fake with its own handler registry - a single
// shared fake would let a test pass even if the implementation wrongly
// subscribed on the publisher connection itself.
function fakeRedis(): FakeRedis {
  const handlers = new Map<string, (...args: unknown[]) => void>();

  const redis: FakeRedis = {
    duplicate: vi.fn(() => fakeRedis()),
    publish: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue("OK"),
    handlers,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
  };

  return redis;
}

type FakeSocket = {
  request: { session?: { passport?: { user?: { id?: string } } } };
  emit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  handlers: Map<string, () => void>;
  on: (event: string, handler: () => void) => void;
  userId?: string;
  connected: boolean;
};

function createFakeSocket(userId?: string): FakeSocket {
  const handlers = new Map<string, () => void>();

  return {
    request: userId ? { session: { passport: { user: { id: userId } } } } : {},
    emit: vi.fn(),
    disconnect: vi.fn(),
    handlers,
    on: (event, handler) => {
      handlers.set(event, handler);
    },
    connected: true,
  };
}

type Harness = {
  sockets: SocketServer;
  httpServer: http.Server;
  sessionMiddleware: RequestHandler;
  connect: (socket: FakeSocket) => Promise<void>;
};

function setup(
  options: {
    identityRepository?: InMemoryIdentityRepository;
    redis?: FakeRedis;
  } = {},
): Harness {
  const httpServer = http.createServer();
  const sessionMiddleware = vi.fn<RequestHandler>((_req, _res, next) => {
    next();
  });

  const sockets = createSocketServer(httpServer, {
    sessionMiddleware,
    ...(options.identityRepository
      ? { identityRepository: options.identityRepository }
      : {}),
    ...(options.redis ? { redis: options.redis as unknown as Redis } : {}),
  });

  return {
    sockets,
    httpServer,
    sessionMiddleware,
    // socket.io registers the handler on its main namespace; invoking it
    // directly keeps the test free of a real websocket client.
    connect: async (socket) => {
      const listeners = sockets.io.sockets.listeners(
        "connection",
      ) as unknown as Array<(socket: Socket) => void>;

      for (const listener of listeners) {
        listener(socket as unknown as Socket);
      }

      // The connection handler resolves the identity asynchronously
      // (deserializeUser-style) when an identityRepository is configured;
      // flush the microtask queue so that lookup has settled before
      // assertions run.
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

async function teardown({ sockets, httpServer }: Harness): Promise<void> {
  await sockets.close();

  httpServer.close();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSocketServer", () => {
  it("runs the session middleware for every handshake", async () => {
    const harness = setup();

    await request(harness.httpServer).get(
      "/socket.io/?EIO=4&transport=polling",
    );

    expect(harness.sessionMiddleware).toHaveBeenCalled();

    await teardown(harness);
  });

  it("disconnects a socket without an authenticated session", async () => {
    const harness = setup();
    const socket = createFakeSocket();

    await harness.connect(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.handlers.has("disconnect")).toBe(false);

    await teardown(harness);
  });

  it("delivers events to the connected socket of a user", async () => {
    vi.spyOn(logger, "info").mockReturnValue();

    const harness = setup();
    const socket = createFakeSocket("user-1");

    await harness.connect(socket);
    harness.sockets.notifyUser("user-1", "user_data_updated", { a: 1 });

    expect(socket.emit.mock.calls).toEqual([["user_data_updated", { a: 1 }]]);

    await teardown(harness);
  });

  it("delivers events to every socket a user has open", async () => {
    vi.spyOn(logger, "info").mockReturnValue();

    const harness = setup();
    const first = createFakeSocket("user-1");
    const second = createFakeSocket("user-1");

    await harness.connect(first);
    await harness.connect(second);
    harness.sockets.notifyUser("user-1", "ping", null);

    expect(first.emit).toHaveBeenCalledOnce();
    expect(second.emit).toHaveBeenCalledOnce();

    await teardown(harness);
  });

  it("does not deliver events across users", async () => {
    vi.spyOn(logger, "info").mockReturnValue();

    const harness = setup();
    const socket = createFakeSocket("user-1");

    await harness.connect(socket);
    harness.sockets.notifyUser("user-2", "ping", null);

    expect(socket.emit).not.toHaveBeenCalled();

    await teardown(harness);
  });

  it("ignores notifications for a user with no sockets", async () => {
    const harness = setup();

    expect(() =>
      harness.sockets.notifyUser("nobody", "ping", null),
    ).not.toThrow();

    await teardown(harness);
  });

  it("stops delivering to a socket once it disconnects", async () => {
    vi.spyOn(logger, "info").mockReturnValue();

    const harness = setup();
    const socket = createFakeSocket("user-1");

    await harness.connect(socket);
    socket.handlers.get("disconnect")?.();
    harness.sockets.notifyUser("user-1", "ping", null);

    expect(socket.emit).not.toHaveBeenCalled();

    await teardown(harness);
  });

  it("keeps the remaining sockets of a user after one disconnects", async () => {
    vi.spyOn(logger, "info").mockReturnValue();

    const harness = setup();
    const first = createFakeSocket("user-1");
    const second = createFakeSocket("user-1");

    await harness.connect(first);
    await harness.connect(second);
    first.handlers.get("disconnect")?.();
    harness.sockets.notifyUser("user-1", "ping", null);

    expect(first.emit).not.toHaveBeenCalled();
    expect(second.emit).toHaveBeenCalledOnce();

    await teardown(harness);
  });

  it("tolerates a duplicate disconnect", async () => {
    vi.spyOn(logger, "info").mockReturnValue();

    const harness = setup();
    const socket = createFakeSocket("user-1");

    await harness.connect(socket);

    const disconnect = socket.handlers.get("disconnect");

    disconnect?.();

    expect(() => disconnect?.()).not.toThrow();

    await teardown(harness);
  });

  it("closes cleanly", async () => {
    const harness = setup();

    await expect(harness.sockets.close()).resolves.toBeUndefined();

    harness.httpServer.close();
  });

  describe("identity verification", () => {
    it("admits a connection whose session id resolves to a real identity", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const identityRepository = new InMemoryIdentityRepository();

      identityRepository.seed(buildIdentity({ uid: "user-1" }));

      const harness = setup({ identityRepository });
      const socket = createFakeSocket("user-1");

      await harness.connect(socket);

      expect(socket.disconnect).not.toHaveBeenCalled();

      harness.sockets.notifyUser("user-1", "ping", null);
      expect(socket.emit).toHaveBeenCalledOnce();

      await teardown(harness);
    });

    it("disconnects a session whose backing identity no longer exists", async () => {
      const identityRepository = new InMemoryIdentityRepository();
      const harness = setup({ identityRepository });
      const socket = createFakeSocket("deleted-user");

      await harness.connect(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.handlers.has("disconnect")).toBe(false);

      await teardown(harness);
    });

    it("fails closed and disconnects when the identity's stored tokens can't be decrypted", async () => {
      const warn = vi.spyOn(logger, "warn").mockReturnValue();
      const identityRepository = new InMemoryIdentityRepository();

      vi.spyOn(identityRepository, "getIdentity").mockRejectedValue(
        new TokenDecryptionError(new Error("bad auth tag")),
      );

      const harness = setup({ identityRepository });
      const socket = createFakeSocket("user-1");

      await harness.connect(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(warn).toHaveBeenCalled();

      await teardown(harness);
    });

    it("does not register a socket that disconnects while identity resolution is still pending", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const identityRepository = new InMemoryIdentityRepository();
      const identity = buildIdentity({ uid: "user-1" });

      identityRepository.seed(identity);

      let resolveLookup!: (value: typeof identity) => void;
      const pending = new Promise<typeof identity>((resolve) => {
        resolveLookup = resolve;
      });

      vi.spyOn(identityRepository, "getIdentity").mockReturnValue(pending);

      const harness = setup({ identityRepository });
      const socket = createFakeSocket("user-1");

      const listeners = harness.sockets.io.sockets.listeners(
        "connection",
      ) as unknown as Array<(socket: Socket) => void>;

      for (const listener of listeners) {
        listener(socket as unknown as Socket);
      }

      // Give handleConnection a tick to actually call getIdentity and start
      // awaiting the (deliberately still-pending) lookup above.
      await new Promise((resolve) => setImmediate(resolve));

      // The client disconnects (e.g. a flaky reconnect) while that lookup is
      // still in flight - real socket.io would flip .connected to false at
      // this point, before handleConnection ever gets to registerSocket().
      socket.connected = false;

      resolveLookup(identity);

      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      // Never registered: no disconnect listener was attached (it would
      // never fire anyway, since the disconnect already happened) and the
      // socket doesn't receive events as if it were a live connection.
      expect(socket.handlers.has("disconnect")).toBe(false);

      harness.sockets.notifyUser("user-1", "ping", null);
      expect(socket.emit).not.toHaveBeenCalled();

      await teardown(harness);
    });

    it("disconnects when the identity lookup fails for another reason", async () => {
      const error = vi.spyOn(logger, "error").mockReturnValue();
      const identityRepository = new InMemoryIdentityRepository();

      vi.spyOn(identityRepository, "getIdentity").mockRejectedValue(
        new Error("firestore unavailable"),
      );

      const harness = setup({ identityRepository });
      const socket = createFakeSocket("user-1");

      await harness.connect(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(error).toHaveBeenCalled();

      await teardown(harness);
    });
  });

  describe("disconnectUser", () => {
    it("forcibly disconnects every live socket for a user", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const harness = setup();
      const first = createFakeSocket("user-1");
      const second = createFakeSocket("user-1");

      await harness.connect(first);
      await harness.connect(second);

      harness.sockets.disconnectUser("user-1");

      expect(first.disconnect).toHaveBeenCalledWith(true);
      expect(second.disconnect).toHaveBeenCalledWith(true);

      harness.sockets.notifyUser("user-1", "ping", null);
      expect(first.emit).not.toHaveBeenCalled();
      expect(second.emit).not.toHaveBeenCalled();

      await teardown(harness);
    });

    it("does nothing for a user with no live sockets", async () => {
      const harness = setup();

      expect(() => harness.sockets.disconnectUser("nobody")).not.toThrow();

      await teardown(harness);
    });
  });

  describe("cross-instance disconnect fanout", () => {
    it("publishes to the disconnect channel when redis is configured", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const redis = fakeRedis();
      const harness = setup({ redis });
      const socket = createFakeSocket("user-1");

      await harness.connect(socket);
      harness.sockets.disconnectUser("user-1");

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(redis.publish).toHaveBeenCalledWith(
        "dinkdonk:socket:disconnect",
        "user-1",
      );

      await teardown(harness);
    });

    it("subscribes on a dedicated duplicate connection, not the publisher connection", async () => {
      const redis = fakeRedis();
      const harness = setup({ redis });

      expect(redis.duplicate).toHaveBeenCalledOnce();
      // The publisher connection itself never subscribes - only the
      // duplicate() result does (asserted via the message-delivery test
      // below, which would fail if the wiring were swapped).
      expect(redis.subscribe).not.toHaveBeenCalled();

      await teardown(harness);
    });

    it("disconnects a locally-connected socket when another instance publishes a disconnect", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const redis = fakeRedis();
      const harness = setup({ redis });
      const socket = createFakeSocket("user-1");

      await harness.connect(socket);

      const subscriber = redis.duplicate.mock.results[0]?.value as FakeRedis;
      const onMessage = subscriber.handlers.get("message");

      // Simulates a different instance's disconnectUser() publishing this
      // event - this instance never called disconnectUser() itself, only
      // received the fanout. ioredis's 'message' event passes (channel,
      // message) as two separate arguments, not an array.
      onMessage?.("dinkdonk:socket:disconnect", "user-1");

      expect(socket.disconnect).toHaveBeenCalledWith(true);

      await teardown(harness);
    });

    it("ignores a message on an unrelated channel", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const redis = fakeRedis();
      const harness = setup({ redis });
      const socket = createFakeSocket("user-1");

      await harness.connect(socket);

      const subscriber = redis.duplicate.mock.results[0]?.value as FakeRedis;
      const onMessage = subscriber.handlers.get("message");

      onMessage?.("some-other-channel", "user-1");

      expect(socket.disconnect).not.toHaveBeenCalled();

      await teardown(harness);
    });

    it("still disconnects local sockets and does not throw when redis is not configured", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const harness = setup();
      const socket = createFakeSocket("user-1");

      await harness.connect(socket);

      expect(() => harness.sockets.disconnectUser("user-1")).not.toThrow();
      expect(socket.disconnect).toHaveBeenCalledWith(true);

      await teardown(harness);
    });

    it("logs and does not throw when the publish fails", async () => {
      vi.spyOn(logger, "info").mockReturnValue();
      const error = vi.spyOn(logger, "error").mockReturnValue();
      const redis = fakeRedis();

      redis.publish.mockRejectedValue(new Error("connection lost"));

      const harness = setup({ redis });
      const socket = createFakeSocket("user-1");

      await harness.connect(socket);

      expect(() => harness.sockets.disconnectUser("user-1")).not.toThrow();
      expect(socket.disconnect).toHaveBeenCalledWith(true);

      await new Promise((resolve) => setImmediate(resolve));

      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1" }),
        "Failed to publish a socket disconnect event to other instances",
      );

      await teardown(harness);
    });

    it("closes the subscriber connection on close()", async () => {
      const redis = fakeRedis();
      const harness = setup({ redis });
      const subscriber = redis.duplicate.mock.results[0]?.value as FakeRedis;

      await teardown(harness);

      expect(subscriber.quit).toHaveBeenCalledOnce();
    });
  });

  describe("per-user socket cap", () => {
    it("disconnects the oldest socket once a user exceeds the concurrent socket cap", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const harness = setup();
      const sockets = Array.from({ length: 9 }, () => createFakeSocket("user-1"));

      for (const socket of sockets) {
        await harness.connect(socket);
      }

      const [oldest, ...rest] = sockets;

      expect(oldest?.disconnect).toHaveBeenCalledWith(true);

      harness.sockets.notifyUser("user-1", "ping", null);

      expect(oldest?.emit).not.toHaveBeenCalled();

      for (const socket of rest) {
        expect(socket.emit).toHaveBeenCalledOnce();
      }

      await teardown(harness);
    });
  });
});
