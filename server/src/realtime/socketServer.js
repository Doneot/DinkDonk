const { Server } = require('socket.io');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.clientOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });
  const clientsByUserId = new Map();

  io.on('connection', (socket) => {
    const { userId } = socket.handshake.auth || {};
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    socket.userId = userId;
    if (!clientsByUserId.has(userId)) clientsByUserId.set(userId, new Set());
    clientsByUserId.get(userId).add(socket);
    logger.info(`Socket connected for user ${userId}`);

    socket.on('disconnect', () => {
      const sockets = clientsByUserId.get(userId);
      if (!sockets) return;
      sockets.delete(socket);
      if (sockets.size === 0) clientsByUserId.delete(userId);
    });
  });

  return {
    io,
    notifyUser: (userId, event, payload) => {
      const sockets = clientsByUserId.get(userId);
      if (!sockets) return;
      sockets.forEach((socket) => socket.emit(event, payload));
    },
    close: () => new Promise((resolve) => io.close(resolve)),
  };
}

module.exports = { createSocketServer };
