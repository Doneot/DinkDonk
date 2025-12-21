// server/server.js
const http = require("http");
const socketIo = require("socket.io");
const readline = require("readline");
const { ExpressServer } = require("./ExpressServer");
const { TwitchWrapper } = require("./TwitchWrapper");
const { FirestoreWrapper } = require("./FirestoreWrapper");
const { DiscordWrapper } = require("./DiscordWrapper");
const { DISCORD_TOKEN, SOCKET_URL, NODE_ENV } = require("./config");

let gcRunning = false;

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
let botContext = { twitch, firestore };
const discord = new DiscordWrapper(
  DISCORD_TOKEN,
  handleUserUpdateDMability,
  botContext
);
botContext.discord = discord;
const server = new ExpressServer(botContext);

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
  const userId = socket.handshake.auth.userId;
  socket.userId = userId;

  if (!userId) {
    console.log("⚠️ Connection rejected: no userId provided");
    socket.disconnect(true); // force disconnect unregistered socket
    return;
  }

  console.log(`⚡ Client connected as user ${userId}`);

  if (!connectedClients.has(userId)) {
    connectedClients.set(userId, new Set());
  }
  connectedClients.get(userId).add(socket);

  socket.on("disconnect", () => {
    const userSockets = connectedClients.get(userId);
    if (userSockets) {
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

firestore.on("streamerAdded", handleStreamerAdded);
firestore.on("streamerEmpty", async (streamer_id) => {
  await garbageCollectStreamer(streamer_id);
});

discord.bot.on("ready", async () => {
  server.start();
  httpServer.listen(4000, () => {
    console.log("🧠 WebSocket server listening on port 4000");
  });
});

async function handleServerReady() {
  console.log("Express server is ready!");

  const init = async () => {
    await subscribeToStreamers();
    await garbageCollectSubscriptions();
  };

  if (twitch.ready) {
    await init();
  } else {
    twitch.on("ready", init);
  }

  twitch.on("tokenRefreshed", init);

  await startupGarbageCollect();
  startPeriodicGarbageCollector();
}

async function getStreamOnlineSubscriptions() {
  return (await twitch.getSubscriptions()).filter(
    (sub) => sub.type === "stream.online"
  );
}


async function subscribeToStreamers() {
  const streamers = await firestore.getStreamers();
  const subs = await getStreamOnlineSubscriptions();

  for (const streamer of streamers) {
    const exists = subs.some(
      (sub) => sub.condition?.broadcaster_user_id === streamer.streamer_id
    );

    if (!exists) {
      console.log(
        `📡 Subscribing to stream.online for ${streamer.streamer_id}`
      );
      await twitch.subscribeEvent("stream.online", {
        broadcaster_user_id: streamer.streamer_id,
      });
    }
  }
}


async function handleUserUpdateDMability(userId, update) {
  await firestore.addOrUpdateUser(userId, { canReceiveDM: update });
}

async function handleStreamerAdded(streamer_id) {
  const subs = await getStreamOnlineSubscriptions();

  const exists = subs.some(
    (sub) => sub.condition?.broadcaster_user_id === streamer.streamer_id
  );

  if (exists) {
    console.log(
      `ℹ️ EventSub already exists for streamer ${streamer_id}`
    );
    return;
  }

  console.log(`📡 Subscribing to stream.online for ${streamer_id}`);
  await twitch.subscribeEvent("stream.online", {
    broadcaster_user_id: streamer_id,
  });
}


async function handleStreamOnline(event) {
  console.log("Stream is online:", event);
  const streamer = await twitch.getStreamer(
    event.broadcaster_user_login.toLowerCase()
  );
  const usersIds = (await firestore.getStreamer(streamer.id))["users"];
  for (const userId of usersIds) {
    const user = await firestore.getUser(userId);
    if (!user.canReceiveDM) {
      console.log(
        `❌ User ${userId} cannot receive DMs, skipping notification`
      );
      continue;
    }
    const notification_message = await firestore.getMessage(
      userId,
      streamer.id
    );
    await discord.handleStreamerOnLive(userId, streamer, notification_message);
  }
}

async function startupGarbageCollect() {
  console.log("🧹 Running startup GC");

  const streamers = await firestore.getStreamers();

  for (const streamer of streamers) {
    if (!streamer.users || streamer.users.length === 0) {
      await garbageCollectStreamer(streamer.streamer_id);
    }
  }
}

function startPeriodicGarbageCollector() {
  const GC_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

  setInterval(async () => {
    try {
      console.log("🕒 Periodic GC tick");
      await garbageCollectSubscriptions();
    } catch (err) {
      console.error("❌ Periodic GC failed:", err);
    }
  }, GC_INTERVAL);
}



async function garbageCollectSubscriptions() {
  if (gcRunning) {
    console.log("⏳ GC already running, skipping");
    return;
  }
  gcRunning = true;
  try {
    console.log("🧹 Starting EventSub garbage collection...");

    const subs = await getStreamOnlineSubscriptions();

    for (const sub of subs) {
      const streamerId = sub.condition?.broadcaster_user_id;
      if (!streamerId) continue;

      const streamer = await firestore.getStreamer(streamerId);

      if (!streamer || streamer.users.length === 0) {
        await garbageCollectStreamer(streamerId);
      }
    }

    console.log("✅ EventSub garbage collection finished");
  } finally {
    gcRunning = false;
  }
}


async function garbageCollectStreamer(streamer_id) {
  console.log(`🧹 GC started for streamer [${streamer_id}]`);

  const streamer = await firestore.getStreamer(streamer_id);
  if (streamer && streamer.users.length > 0) {
    console.log(
      `⏭️ Skipping GC for streamer ${streamer_id} (users reappeared)`
    );
    return;
  }

  // 1️⃣ Remove Twitch EventSub
  const subs = await getStreamOnlineSubscriptions();
  const matching = subs.filter(
    (s) =>
      s.condition?.broadcaster_user_id === streamer_id
  );

  for (const sub of matching) {
    await twitch.unsubscribeEvent(sub.id);
  }

  // 2️⃣ Delete Firestore doc
  await firestore.deleteStreamer(streamer_id);

  console.log(`✅ GC completed for streamer [${streamer_id}]`);
}



["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, async () => {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    console.log("Terminating script...");
    //await twitch.unsubscribeAllEvents();
    await io.close();
    process.exit();
  });
});
