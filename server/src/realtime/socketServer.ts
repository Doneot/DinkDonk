import type { Server as HttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Session, SessionData } from "express-session";
import { Server, type Socket } from "socket.io";
import { env } from "../shared/config/env.js";
import { logger } from "../shared/logger/logger.js";
import type { IdentityRepository } from "../modules/auth/ports/IdentityRepository.js";
import { resolveIdentity } from "../modules/auth/application/resolveIdentity.js";

type AuthenticatedSocket = Socket & {
  userId: string;
};

type SocketPayload = unknown;

export type SocketServer = {
  io: Server;

  notifyUser(userId: string, event: string, payload: SocketPayload): void;

  /**
   * Forcibly disconnects every live socket a user currently has open (e.g.
   * on logout, once the Firestore session doc has been destroyed) so a
   * revoked session can't keep receiving realtime events through a
   * connection that was already established before the logout happened.
   */
  disconnectUser(userId: string): void;

  close(): Promise<void>;
};

type CreateSocketServerOptions = {
  sessionMiddleware: RequestHandler;

  // Optional so existing callers keep compiling without changes. When
  // supplied, every connection is verified the same way Passport's
  // deserializeUser verifies an HTTP request (see passport.ts): the identity
  // is re-fetched from storage and the connection is refused if it can't be
  // resolved (deleted identity) or its stored tokens can't be decrypted,
  // rather than trusting whatever id happens to be sitting in the session
  // blob. Without it, a session whose backing identity was deleted/corrupted
  // would still get full realtime access.
  identityRepository?: IdentityRepository;
};

type SessionRequest = IncomingMessage & {
  session?: Session & Partial<SessionData>;
};

// Hard cap on concurrent sockets per user. Without one, a single account
// (a runaway client, many open tabs, or someone deliberately abusive) could
// accumulate unbounded live connections. Oldest-out rather than reject-new,
// so a burst of reconnects (e.g. flaky wifi opening a new socket before the
// old one has timed out) doesn't lock the user out of realtime updates.
const MAX_SOCKETS_PER_USER = 8;

export function createSocketServer(
  httpServer: HttpServer,
  { sessionMiddleware, identityRepository }: CreateSocketServerOptions,
): SocketServer {
  const io = new Server(httpServer, {
    cors: {
      origin: env.clientOrigin,

      methods: ["GET", "POST"],

      credentials: true,
    },
  });

  const clientsByUserId = new Map<string, Set<AuthenticatedSocket>>();

  io.engine.use(
    (req: IncomingMessage, res: ServerResponse, next: (err?: Error) => void) => {
      sessionMiddleware(
        req as unknown as Request,
        res as unknown as Response,
        next as NextFunction,
      );
    },
  );

  function registerSocket(socket: Socket, userId: string): void {
    const authenticatedSocket = socket as AuthenticatedSocket;

    authenticatedSocket.userId = userId;

    let sockets = clientsByUserId.get(userId);

    if (!sockets) {
      sockets = new Set();
      clientsByUserId.set(userId, sockets);
    }

    if (sockets.size >= MAX_SOCKETS_PER_USER) {
      // Sets iterate in insertion order, so the first entry is the oldest
      // still-open socket for this user.
      const oldest = sockets.values().next().value;

      if (oldest) {
        sockets.delete(oldest);
        oldest.disconnect(true);
      }
    }

    sockets.add(authenticatedSocket);

    logger.info({ userId }, "Socket connected");

    authenticatedSocket.on(
      "disconnect",

      (): void => {
        const remaining = clientsByUserId.get(userId);

        if (!remaining) {
          return;
        }

        remaining.delete(authenticatedSocket);

        if (remaining.size === 0) {
          clientsByUserId.delete(userId);
        }
      },
    );
  }

  async function handleConnection(
    socket: Socket,
    userId: string,
  ): Promise<void> {
    if (identityRepository) {
      try {
        const result = await resolveIdentity(
          identityRepository,
          userId,
          "Failed to decrypt stored tokens for socket connection; disconnecting",
        );

        if (result.status !== "found") {
          socket.disconnect(true);

          return;
        }
      } catch (error) {
        logger.error(
          { userId, error },
          "Failed to resolve identity for socket connection",
        );

        socket.disconnect(true);

        return;
      }
    }

    // The client can disconnect while the identity resolution above was in
    // flight (a very real scenario - flaky reconnect churn is exactly what
    // MAX_SOCKETS_PER_USER's oldest-out eviction anticipates). socket.io
    // fires its one-shot 'disconnect' event immediately when that happens,
    // before this async handler resumes - registering the socket anyway
    // would attach a 'disconnect' listener that can now never fire, leaking
    // a dead entry into clientsByUserId forever and letting it count toward
    // (and evict a real connection from) the per-user cap.
    if (!socket.connected) {
      return;
    }

    registerSocket(socket, userId);
  }

  io.on(
    "connection",

    (socket: Socket): void => {
      const request = socket.request as typeof socket.request & SessionRequest;
      const userId = request.session?.passport?.user?.id ?? null;

      if (!userId) {
        socket.disconnect(true);

        return;
      }

      void handleConnection(socket, userId);
    },
  );

  return {
    io,

    notifyUser(userId: string, event: string, payload: SocketPayload): void {
      const sockets = clientsByUserId.get(userId);

      if (!sockets) {
        return;
      }

      sockets.forEach((socket): void => {
        socket.emit(event, payload);
      });
    },

    disconnectUser(userId: string): void {
      const sockets = clientsByUserId.get(userId);

      if (!sockets) {
        return;
      }

      clientsByUserId.delete(userId);

      sockets.forEach((socket): void => {
        socket.disconnect(true);
      });
    },

    close(): Promise<void> {
      return new Promise((resolve): void => {
        void io.close(() => {
          resolve();
        });
      });
    },
  };
}
