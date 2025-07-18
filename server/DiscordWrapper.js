const Discord = require("discord.js-selfbot-v13");

class DiscordWrapper {
  constructor(discordToken) {
    this.bot = new Discord.Client({
      disableMentions: "everyone",
    });
    this.bot.login(discordToken);
  }

  async onReady() {
    console.log(`Logged in as ${this.bot.user.username}`);
  }

  createEmbed(streamer, stream, thumbnailUrl) {
    return new Discord.WebEmbed({
      author: {
        name: stream.user_name,
        url: `https://www.twitch.tv/${stream.user_name}`,
        iconURL: streamer.profile_image_url,
      },
      color: "PURPLE",
      description: `${stream.user_name} is live on twitch!\n\n**Playing **\n${stream.game_name}`,
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

  async handleStreamerOnLive(user_id, streamer, stream, notification_message) {
    const user = await this.bot.users.fetch(user_id);
    const channel = await this.bot.users.createDM(user);
    const thumbnailUrl = stream.thumbnail_url
      .replace("{width}", 1280)
      .replace("{height}", 720);
    const embed = this.createEmbed(streamer, stream, thumbnailUrl);

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

module.exports = { DiscordWrapper };
