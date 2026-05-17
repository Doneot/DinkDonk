import { io } from 'socket.io-client';
import { env } from '../config/env';

export function createSocket(userId) {
  return io(env.socketUrl, {
    transports: ['websocket'],
    withCredentials: env.isProduction,
    auth: { userId },
  });
}
