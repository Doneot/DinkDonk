// socket.js
import { io } from "socket.io-client";

export const createSocket = (userId) => {
  return io(import.meta.env.VITE_SOCKET_URL, {
    transports: ["websocket"],
    withCredentials: import.meta.env.VITE_ENV === "production",
    auth: {
      userId,
    },
  });
};
