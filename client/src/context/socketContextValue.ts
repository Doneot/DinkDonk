import { createContext, useContext } from "react";
import type { Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "../shared/socket";

export interface SocketContextValue {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  connected: boolean;
}

export const SocketContext = createContext<SocketContextValue | null>(null);

export function useSocket(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
}
