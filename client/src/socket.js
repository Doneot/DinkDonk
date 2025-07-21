// socket.js
import { io } from "socket.io-client";

const socket = io(`${import.meta.env.VITE_SOCKET_URL}`, {
  transports: ["websocket"],
  withCredentials: false,//!import.meta.env.VITE_SOCKET_URL.includes("localhost"),
});

export default socket;
