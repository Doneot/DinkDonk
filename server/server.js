const { ExpressServer } = require("./ExpressServer");
const { TwitchWrapper } = require("./TwitchWrapper");
const { FirestoreWrapper } = require("./FirestoreWrapper");
const { DiscordWrapper } = require("./DiscordWrapper");
const { DISCORD_TOKEN } = require("./config");

const twitch = new TwitchWrapper();
const firestore = new FirestoreWrapper();
const discord = new DiscordWrapper(DISCORD_TOKEN, handleUserJoinGuild);
const server = new ExpressServer(discord, twitch, firestore);

server.on("ready", handleServerReady);
server.on("stream.online", handleStreamOnline);

firestore.on("streamerAdd", handleStreamerAdded);

discord.bot.on("ready", async () => {
  server.start();
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

async function handleUserJoinGuild(userId) {
  await firestore.updateUserDMability(userId, { canReceiveDM: true });
}

async function handleStreamerAdded(streamer_id) {
  await twitch.subscribeEvent("stream.online", {
    broadcaster_user_id: streamer_id,
  });
}

async function handleStreamOnline(event) {
  console.log("Stream is online:", event);
  const streamer = (
    await twitch.getStreamer(event.broadcaster_user_login.toLowerCase())
  )[0];
  const stream = (await twitch.getStream(streamer.id))[0];
  const usersIds = (await firestore.getStreamer(streamer.id))["users"];
  for (const userId of usersIds) {
    const notification_message = await firestore.getMessage(
      userId,
      streamer.id
    );
    await discord.handleStreamerOnLive(
      userId,
      streamer,
      stream,
      notification_message
    );
  }
}

process.on("SIGINT", async () => {
  console.log("Terminating script...");
  await twitch.unsubscribeAllEvents();
  process.exit();
});
