import { useEffect, useMemo, useRef, useState } from 'react';
import { createSocket } from '../services/socket';
import { useAuth } from './authContextValue';
import { SocketContext } from './socketContextValue';

export function SocketProvider({ children }) {
  const { user, setUser } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user?.id || socketRef.current) return undefined;

    const socket = createSocket(user.id);
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('user_data_updated', (updatedUser) => {
      setUser((previousUser) => ({ ...previousUser, ...updatedUser }));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [setUser, user?.id]);

  const value = useMemo(() => ({ socket: socketRef.current, connected }), [connected]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
