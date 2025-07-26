import { useEffect, useRef } from "react";
import { createSocket } from "../socket";

export const useSocket = (user, onUserDataUpdate) => {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;

    // Create socket once user is authenticated
    if (!socketRef.current) {
      socketRef.current = createSocket(user.id);

      socketRef.current.on("connect", () => {
        console.log("✅ Socket connected as", user.id);
      });

      socketRef.current.on("user_data_updated", (updatedUser) => {
        console.log("🔁 Got updated user data:", updatedUser);
        onUserDataUpdate(updatedUser);
      });
    }

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [user?.id]);

  return socketRef;
};
