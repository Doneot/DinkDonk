const Discord = require("discord.js-selfbot-v13");
const clc = require("cli-color");
const { WebhookServer } = require("./WebhookServer");
const { TwitchWrapper } = require("./TwitchWrapper");
const { FirestoreWrapper } = require("./FirestoreWrapper");
const EventEmitter = require("events");
require("dotenv").config();

const server = new WebhookServer();
const twitch = new TwitchWrapper();
const firestore = new FirestoreWrapper(twitch);

const bot = new Discord.Client({
  disableMentions: "everyone",
});

// Create an event emitter
const eventEmitter = new EventEmitter();

server.on("ready", async () => {
  console.log("Webhook server is ready!");
  const streamers = await firestore.getStreamers();
  for (const streamer of streamers) {
    await twitch.subscribeEvent("stream.online", {
      broadcaster_user_id: streamer["id"],
    });
  }
});

server.on("stream.online", (event) => {
  console.log("Stream is online:", event);
  // Handle stream.online event
  handleStreamerOnLive(event.broadcaster_user_login.toLowerCase());
});

bot.on("ready", async () => {
  await getTokens(twitch);
  server.start();
  console.log(clc.green(`Logged in as ${bot.user.username}`));
  setTimeout(async () => {
    // console.clear();
    console.log(clc.green("Ready to go"));
  }, 2000);
});

bot.on("messageCreate", async (message) => {
  const OwnerDMChannel = await bot.channels.fetch(process.env.OWNER_DM_CHANNEL);
  if (message.channel.id === OwnerDMChannel.id) {
    if (message.content.startsWith("!getToken")) {
      await getTokens(twitch);
    }
    if (message.content.startsWith("!getUsers")) {
      const users = await firestore.getUsers();
      message.channel.send(JSON.stringify(users));
    } else if (message.content.startsWith("!getNotifiedUsers")) {
      let args = message.content.split(" ");
      const users = await firestore.getUsersToNotify(args[1]);
      console.log(users);
    } else if (message.content.startsWith("!getMessage")) {
      let args = message.content.split(" ");
      const message = await firestore.getMessage(args[1]);
      console.log(message);
    } else if (message.content.startsWith("!getStreamer")) {
      let args = message.content.split(" ");
      console.log(await twitch.getStreamer(args[1]));
    } else if (message.content.startsWith("!addStreamerToUser")) {
      let args = message.content.split(" ");
      await firestore.addStreamerToUser(args[1], args[2]);
    } else if (message.content.startsWith("!addUser")) {
      let args = message.content.split(" ");
      await firestore.addUser({
        username: args[1],
        id: args[2],
        streamers: args.slice(3),
      });
    } else if (message.content.startsWith("!addStreamer")) {
      let args = message.content.split(" ");
      await firestore.addStreamer(args[1], args.splice(2).join(" "));
    } else if (message.content.startsWith("!setMessage")) {
      let args = message.content.split(" ");
      await firestore.setMessage(args[1], args.splice(2).join(" "));
    } else if (message.content.startsWith("!test")) {
      let args = message.content.split(" ");
      handleStreamerOnLive(args[1]);
    }
  }
});

bot.login(process.env.DISCORD_TOKEN);

const getTokens = async (twitchWrapper) => {
  try {
    const token = await twitchWrapper.getAccessToken();
    if (!token) return;

    const refreshBeforeExpiry = 300000; // 5 minutes in milliseconds
    const expiresAt =
      Date.now() + token.expires_in * 1000 - refreshBeforeExpiry;

    const checkInterval = 60000; // 1 minute in milliseconds

    const intervalId = setInterval(() => {
      if (Date.now() >= expiresAt) {
        clearInterval(intervalId);
        getTokens(twitchWrapper);
      }
    }, checkInterval);

    return token;
  } catch (error) {
    console.error("Error refreshing token:", error);
    // Retry after a short delay if token refresh fails
    setTimeout(() => {
      getTokens(twitchWrapper);
    }, 60000); // Retry after 1 minute
  }
};

const handleStreamerOnLive = async (streamername) => {
  const message = await firestore.getMessage(streamername);
  const users = await firestore.getUsersToNotify(streamername);
  const discordUsers = [];
  for (const user of users) {
    discordUsers.push(await bot.users.fetch(user["id"]));
  }
  const OwnerDMChannel = await bot.channels.fetch("1256237800722796696");
  const streamer = (await twitch.getStreamer(streamername))[0];
  const stream = (await twitch.getStream(streamer["id"]))[0];
  console.log(stream);
  let thumbnailUrl = stream["thumbnail_url"]
    .replace("{width}", 1280)
    .replace("{height}", 720);
  const embed = new Discord.WebEmbed({
    author: {
      name: stream["user_name"],
      url: `https://www.twitch.tv/${streamername}`,
      iconURL: streamer["profile_image_url"],
    },
    color: "PURPLE",
    description: `${streamername} est en live sur twitch!\n\n**Joue à**\nGenshin Impact`,
    title: stream["title"],
    url: `https://www.twitch.tv/${streamername}`,
    // redirect: `https://www.twitch.tv/${streamername}`,
    thumbnail: {
      url: thumbnailUrl,
      height: 720,
      width: 1280,
    },
    video: {
      url: `https://player.twitch.tv/?channel=${streamername}&player=facebook&autoplay=true&parent=meta.tag`,
      proxyURL: undefined,
      height: 378,
      width: 620,
    },
  });
  OwnerDMChannel.send({
    content:
      message +
      `\n<https://www.twitch.tv/${streamername}>` +
      `\n||${discordUsers.join(" ")}||` +
      `${Discord.WebEmbed.hiddenEmbed}${embed}`,
  });
};

process.on("SIGINT", async () => {
  console.log("Terminating script...");

  // Unsubscribe from all active subscriptions
  const streamers = await firestore.getStreamers();
  for (const streamer of streamers) {
    await twitch.unsubscribeEvent("stream.online", {
      broadcaster_user_id: streamer.id,
    });
  }
  process.exit();
});
