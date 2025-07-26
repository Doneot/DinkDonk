// src/context/SocketContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { user, setUser } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user?.id || socketRef.current) return;

    const socket = io(import.meta.env.VITE_SOCKET_URL, {
      transports: ["websocket"],
      withCredentials: import.meta.env.VITE_ENV === "production",
      auth: {
        userId: user.id,
      },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("⚡ Socket connected as", user.id);
      setConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("🔌 Socket disconnected");
      setConnected(false);
    });

    socket.on("user_data_updated", (updatedUser) => {
      console.log("🔁 Updated user data from socket:", updatedUser);
      setUser((prev) => ({ ...prev, ...updatedUser }));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id]);

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        connected,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
