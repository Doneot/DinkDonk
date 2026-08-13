import { createContext, useContext } from "react";
import type { Socket } from "socket.io-client";

import type { ServerToClientEvents, ClientToServerEvents } from "../shared/socket";

export interface LiveState {
  isLive: boolean;
  liveSince: string | null;
}

export interface SocketContextValue {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  connected: boolean;
  /** Keyed by streamer id. Only ever grows with confirmed pushes from the
   * server - a streamer absent here simply hasn't had a live-state change
   * pushed yet this session (see useSubscriptions' /streamers/info fetch for
   * the initial value on load). */
  liveStreamers: Record<string, LiveState>;
}

export const SocketContext = createContext<SocketContextValue | null>(null);

export function useSocket(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
}
