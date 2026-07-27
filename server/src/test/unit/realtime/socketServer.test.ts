import http from "node:http";
import type { RequestHandler } from "express";
import type { Socket } from "socket.io";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSocketServer } from "../../../realtime/socketServer.js";
import type { SocketServer } from "../../../realtime/socketServer.js";
import { logger } from "../../../shared/logger/logger.js";

type FakeSocket = {
  request: { session?: { passport?: { user?: { id?: string } } } };
  emit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  handlers: Map<string, () => void>;
  on: (event: string, handler: () => void) => void;
  userId?: string;
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
  };
}

type Harness = {
  sockets: SocketServer;
  httpServer: http.Server;
  sessionMiddleware: RequestHandler;
  connect: (socket: FakeSocket) => void;
};

function setup(): Harness {
  const httpServer = http.createServer();
  const sessionMiddleware = vi.fn<RequestHandler>((_req, _res, next) => {
    next();
  });

  const sockets = createSocketServer(httpServer, { sessionMiddleware });

  return {
    sockets,
    httpServer,
    sessionMiddleware,
    // socket.io registers the handler on its main namespace; invoking it
    // directly keeps the test free of a real websocket client.
    connect: (socket) => {
      const listeners = sockets.io.sockets.listeners(
        "connection",
      ) as unknown as Array<(socket: Socket) => void>;

      for (const listener of listeners) {
        listener(socket as unknown as Socket);
      }
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

    harness.connect(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.handlers.has("disconnect")).toBe(false);

    await teardown(harness);
  });

  it("delivers events to the connected socket of a user", async () => {
    vi.spyOn(logger, "info").mockReturnValue();

    const harness = setup();
    const socket = createFakeSocket("user-1");

    harness.connect(socket);
    harness.sockets.notifyUser("user-1", "user_data_updated", { a: 1 });

    expect(socket.emit.mock.calls).toEqual([["user_data_updated", { a: 1 }]]);

    await teardown(harness);
  });

  it("delivers events to every socket a user has open", async () => {
    vi.spyOn(logger, "info").mockReturnValue();

    const harness = setup();
    const first = createFakeSocket("user-1");
    const second = createFakeSocket("user-1");

    harness.connect(first);
    harness.connect(second);
    harness.sockets.notifyUser("user-1", "ping", null);

    expect(first.emit).toHaveBeenCalledOnce();
    expect(second.emit).toHaveBeenCalledOnce();

    await teardown(harness);
  });

  it("does not deliver events across users", async () => {
    vi.spyOn(logger, "info").mockReturnValue();

    const harness = setup();
    const socket = createFakeSocket("user-1");

    harness.connect(socket);
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

    harness.connect(socket);
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

    harness.connect(first);
    harness.connect(second);
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

    harness.connect(socket);

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
});
