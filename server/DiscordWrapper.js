const Discord = require("discord.js-selfbot-v13");

class DiscordWrapper {
  constructor(discordToken, twitch, firestore) {
    this.twitch = twitch;
    this.firestore = firestore;
    this.bot = new Discord.Client({
      disableMentions: "everyone",
    });
    this.bot.login(discordToken);
  }

  async onReady() {
    console.log(`Logged in as ${this.bot.user.username}`);
  }

  async onMessageCreate(message) {
    const [command, ...args] = message.content.split(" ");

    const commandMap = {
      "!getUsers": () => this.sendUsers(message, firestore),
      "!getMessage": () => this.sendMessage(message, args, firestore),
      "!addUser": () => this.addUser(message.author.id, firestore),
      "!addStreamer": () => this.addStreamer(args, firestore),
      "!getSubscriptions": () => this.getSubscriptions(message, twitch),
    };

    const action = commandMap[command];
    if (action) {
      await action();
    } else {
      console.log("Unknown command:", command);
    }
  }

  async sendUsers(message, firestore) {
    const users = await firestore.getUsers();
    message.channel.send(JSON.stringify(users));
  }

  async sendMessage(message, args, firestore) {
    const messageText = await firestore.getMessage(message.author.id, args[0]);
    message.channel.send(messageText);
  }

  async addUser(discord_id, firestore) {
    await firestore.addUser(discord_id);
  }

  async addStreamer(args, firestore) {
    await firestore.addStreamer(args[0], args.slice(1).join(" "));
  }

  async getSubscriptions(message, twitch) {
    const subscriptions = await twitch.getSubscriptions();
    message.channel.send(JSON.stringify(subscriptions));
  }

  async setMessage(args, firestore) {
    await firestore.setMessage(args[0], args.slice(1).join(" "));
  }

  async fetchDiscordUsers(users) {
    return Promise.all(
      users.map(async (user) => await this.bot.users.fetch(user.id))
    );
  }

  createEmbed(streamer, stream, thumbnailUrl) {
    return new Discord.WebEmbed({
      author: {
        name: stream.user_name,
        url: `https://www.twitch.tv/${stream.user_name}`,
        iconURL: streamer.profile_image_url,
      },
      color: "PURPLE",
      description: `${stream.user_name} est en live sur twitch!\n\n**Joue à**\n${stream.game_name}`,
      title: stream.title,
      url: `https://www.twitch.tv/${stream.user_name}`,
      thumbnail: {
        url: thumbnailUrl,
        height: 720,
        width: 1280,
      },
      video: {
        url: `https://player.twitch.tv/?channel=${stream.user_name}&player=facebook&autoplay=true&parent=meta.tag`,
        height: 378,
        width: 620,
      },
    });
  }

  async handleStreamerOnLive(users, streamer, stream, notification_message) {
    const discordUsers = await this.fetchDiscordUsers(users);
    const channels = Promise.all(
      discordUsers.map(async (user) => await this.bot.users.createDM(user))
    );
    const thumbnailUrl = stream.thumbnail_url
      .replace("{width}", 1280)
      .replace("{height}", 720);
    const embed = this.createEmbed(streamer, stream, thumbnailUrl);

    for (const channel of channels) {
      channel.send({
        content: `${notification_message.replace(
          /%s/g,
          streamer.display_name
        )}\n<https://www.twitch.tv/${streamer.name}>\n${
          Discord.WebEmbed.hiddenEmbed
        }${embed}`,
      });
    }
  }
}

module.exports = { DiscordWrapper };
