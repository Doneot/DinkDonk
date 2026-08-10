import http from "http";
import { createApp } from "../http/createApp.js";
import type e from "express";
import { createSessionMiddleware } from "../http/configureMiddleware.js";
import {
  createSocketServer,
  type SocketServer,
} from "../realtime/socketServer.js";

import type { Container } from "./container/index.js";

export interface Server {
  httpServer: http.Server;
  sockets: SocketServer;
  app: e.Express;
}

export function createServer(container: Container): Server {
  const httpServer = http.createServer();

  const sessionMiddleware = createSessionMiddleware(container.firestore);

  // Populated once `sockets` exists below. Declared as an indirection so
  // `app` can be built (and attached to httpServer) before `sockets` does -
  // socket.io's `new Server(httpServer, ...)` calls engine.io's attach(),
  // which snapshots httpServer's current "request" listeners so it can
  // delegate any request whose path it doesn't own back to them. If Express
  // isn't registered yet when that snapshot is taken, it's permanently left
  // out of the delegation chain: every request would then reach both
  // engine.io's listener and Express's independently, double-handling
  // socket.io's own requests and corrupting their responses.
  let disconnectUser = (_userId: string): void => {};

  // Destructured out of the spread below rather than left in: container.redis
  // is `Redis | undefined` (undefined when REDIS_URL isn't configured - see
  // createRedisClient()), but createApp's `redis?: Redis` can't accept an
  // explicit `undefined` under exactOptionalPropertyTypes - it must be
  // omitted entirely, not present-and-undefined.
  const { redis, ...containerRest } = container;

  const app = createApp({
    ...containerRest,
    sessionMiddleware,
    twitch: container.twitch.client,
    disconnectUser: (userId) => disconnectUser(userId),
    ...(redis ? { redis } : {}),
  });

  httpServer.on("request", app);

  const sockets = createSocketServer(httpServer, {
    sessionMiddleware,
    identityRepository: container.repositories.identities,
    ...(redis ? { redis } : {}),
  });

  disconnectUser = (userId) => sockets.disconnectUser(userId);

  container.bindSocketNotifier((userId, event, payload) =>
    sockets.notifyUser(userId, event, payload),
  );

  return {
    httpServer,
    sockets,
    app,
  };
}
