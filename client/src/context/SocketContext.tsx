import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Socket } from "socket.io-client";
import {
  createSocket,
  type ServerToClientEvents,
  type ClientToServerEvents,
} from "../shared/socket";
import { useAuth } from "./authContextValue";
import { SocketContext } from "./socketContextValue";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();
  const socketRef = useRef<AppSocket | null>(null);
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  useEffect(() => {
    if (!user?.id || socketRef.current) return undefined;

    const newSocket = createSocket();
    socketRef.current = newSocket;
    setSocket(newSocket);
    setConnected(false);

    newSocket.on("connect", () => setConnected(true));
    newSocket.on("disconnect", () => setConnected(false));
    newSocket.on("connect_error", () => setConnected(false));
    newSocket.on("user_data_updated", (updatedUser) => {
      setUser((previousUser) =>
        previousUser ? { ...previousUser, ...updatedUser } : previousUser,
      );
      setSyncMessage("Your account data was updated.");
    });

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [setUser, user?.id]);

  const value = useMemo(() => ({ socket, connected }), [socket, connected]);

  return (
    <SocketContext.Provider value={value}>
      {children}
      <span className="sr-only" role="status" aria-live="polite">
        {syncMessage}
      </span>
    </SocketContext.Provider>
  );
}
