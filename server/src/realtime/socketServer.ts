import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

type AuthenticatedSocket = Socket & {
  userId: string;
};

type SocketPayload = unknown;

type SocketServer = {
  io: Server;

  notifyUser(userId: string, event: string, payload: SocketPayload): void;

  close(): Promise<void>;
};

export function createSocketServer(httpServer: HttpServer): SocketServer {
  const io = new Server(httpServer, {
    cors: {
      origin: env.clientOrigin,

      methods: ["GET", "POST"],

      credentials: true,
    },
  });

  const clientsByUserId = new Map<string, Set<AuthenticatedSocket>>();

  io.on(
    "connection",

    (socket: Socket): void => {
      const userId =
        typeof socket.handshake.auth?.userId === "string"
          ? socket.handshake.auth.userId
          : null;

      if (!userId) {
        socket.disconnect(true);

        return;
      }

      const authenticatedSocket = socket as AuthenticatedSocket;

      authenticatedSocket.userId = userId;

      if (!clientsByUserId.has(userId)) {
        clientsByUserId.set(userId, new Set());
      }

      clientsByUserId.get(userId)?.add(authenticatedSocket);

      logger.info(`Socket connected for user ${userId}`);

      authenticatedSocket.on(
        "disconnect",

        (): void => {
          const sockets = clientsByUserId.get(userId);

          if (!sockets) {
            return;
          }

          sockets.delete(authenticatedSocket);

          if (sockets.size === 0) {
            clientsByUserId.delete(userId);
          }
        },
      );
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

    close(): Promise<void> {
      return new Promise((resolve): void => {
        void io.close(() => {
          resolve();
        });
      });
    },
  };
}
