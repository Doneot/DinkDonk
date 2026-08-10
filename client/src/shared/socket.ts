import { io, type Socket } from "socket.io-client";
import { env } from "../config/env";
import type { User } from "./types/api";

export interface StreamerLiveChangedPayload {
  streamerId: string;
  isLive: boolean;
  liveSince: string | null;
}

export interface ServerToClientEvents {
  user_data_updated: (updatedUser: Partial<User>) => void;
  streamer_live_changed: (payload: StreamerLiveChangedPayload) => void;
}

export type ClientToServerEvents = Record<string, never>;

// The server derives identity from the session cookie (see
// realtime/socketServer.ts), never from the handshake payload - there's
// nothing to pass here.
export function createSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  return io(env.socketUrl, {
    transports: ["websocket"],
    withCredentials: env.isProduction,
  });
}
