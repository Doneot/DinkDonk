import type { Server as HttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Server, type Socket } from "socket.io";
import { env } from "../shared/config/env.js";
import { logger } from "../shared/logger/logger.js";

type AuthenticatedSocket = Socket & {
  userId: string;
};

type SocketPayload = unknown;

export type SocketServer = {
  io: Server;

  notifyUser(userId: string, event: string, payload: SocketPayload): void;

  close(): Promise<void>;
};

type CreateSocketServerOptions = {
  sessionMiddleware: RequestHandler;
};

type SessionRequest = {
  session?: {
    passport?: {
      user?: {
        id?: string;
      };
    };
  };
};

export function createSocketServer(
  httpServer: HttpServer,
  { sessionMiddleware }: CreateSocketServerOptions,
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

  io.on(
    "connection",

    (socket: Socket): void => {
      const request = socket.request as typeof socket.request & SessionRequest;
      const userId = request.session?.passport?.user?.id ?? null;

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
