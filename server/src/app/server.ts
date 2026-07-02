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

  const sockets = createSocketServer(httpServer, { sessionMiddleware });

  const app = createApp({
    ...container,
    sessionMiddleware,
    twitch: container.twitch.client,
  });

  return {
    httpServer,
    sockets,
    app,
  };
}
