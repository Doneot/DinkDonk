// server/server.js
const http = require("http");
const socketIo = require("socket.io");
const { ExpressServer } = require("./ExpressServer");
const { TwitchWrapper } = require("./TwitchWrapper");
const { FirestoreWrapper } = require("./FirestoreWrapper");
const { DiscordWrapper } = require("./DiscordWrapper");
const { DISCORD_TOKEN, SOCKET_URL, NODE_ENV } = require("./config");

const twitch = new TwitchWrapper();
const firestore = new FirestoreWrapper({
  handleUserChange: async (userId, updatedUser) => {
    if (connectedClients.has(userId)) {
      connectedClients.get(userId).forEach((socket) => {
        socket.emit("user_data_updated", updatedUser);
      });
      console.log(`📢 Notified user ${userId} of update`);
    }
  },
});
const botContext = { twitch, firestore};
const discord = new DiscordWrapper(
  DISCORD_TOKEN,
  handleUserUpdateDMability,
  botContext
);
const server = new ExpressServer(discord, twitch, firestore);

const httpServer = http.createServer();
const io = socketIo(httpServer, {
  cors: {
    origin: SOCKET_URL,
    methods: ["GET", "POST"],
    credentials: NODE_ENV === "production", // true if using https in production
  },
});

const connectedClients = new Map(); // userId => Set<socket>

io.on("connection", (socket) => {
  console.log("⚡ Client connected");

  socket.on("register_user", (userId) => {
    if (!connectedClients.has(userId)) {
      connectedClients.set(userId, new Set());
    }
    connectedClients.get(userId).add(socket);
    socket.userId = userId;
    console.log(`📥 Registered user ${userId} to socket`);
  });

  socket.on("disconnect", () => {
    const userId = socket.userId;
    if (userId && connectedClients.has(userId)) {
      const userSockets = connectedClients.get(userId);
      userSockets.delete(socket);
      if (userSockets.size === 0) {
        connectedClients.delete(userId);
      }
    }
    console.log(`🔌 Socket disconnected (user: ${userId})`);
  });
});

server.on("ready", handleServerReady);
server.on("stream.online", handleStreamOnline);

firestore.on("streamerAdd", handleStreamerAdded);

discord.bot.on("ready", async () => {
  server.start();
  httpServer.listen(4000, () => {
    console.log("🧠 WebSocket server listening on port 4000");
  });
});

async function handleServerReady() {
  console.log("Express server is ready!");
  if (twitch.ready) {
    await twitch.unsubscribeAllEvents();
    await subscribeToStreamers();
  } else {
    twitch.on("ready", async () => {
      await twitch.unsubscribeAllEvents();
      await subscribeToStreamers();
    });
  }
}

async function subscribeToStreamers() {
  const streamers = await firestore.getStreamers();
  for (const streamer of streamers) {
    await twitch.subscribeEvent("stream.online", {
      broadcaster_user_id: streamer["streamer_id"],
    });
  }
}

async function handleUserUpdateDMability(userId, update) {
  await firestore.updateUserDMability(userId, update);
}

async function handleStreamerAdded(streamer_id) {
  await twitch.subscribeEvent("stream.online", {
    broadcaster_user_id: streamer_id,
  });
}

async function handleStreamOnline(event) {
  console.log("Stream is online:", event);
  const streamer = await twitch.getStreamer(event.broadcaster_user_login.toLowerCase());
  const usersIds = (await firestore.getStreamer(streamer.id))["users"];
  for (const userId of usersIds) {
    const user = await firestore.getUser(userId);
    if (!user.canReceiveDM) {
      console.log(`❌ User ${userId} cannot receive DMs, skipping notification`);
      continue;
    }
    const notification_message = await firestore.getMessage(
      userId,
      streamer.id
    );
    await discord.handleStreamerOnLive(userId, streamer, notification_message);
  }
}

process.on("SIGINT", async () => {
  console.log("Terminating script...");
  await twitch.unsubscribeAllEvents();
  await io.close();
  process.exit();
});
