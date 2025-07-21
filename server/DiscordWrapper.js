const {
  Client,
  GatewayIntentBits,
  Events,
  Partials,
  EmbedBuilder,
} = require("discord.js");

class DiscordWrapper {
  constructor(discordToken, handleUserJoin) {
    this.token = discordToken;
    this.handleUserJoin = handleUserJoin;
    this.bot = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel], // Needed for DM handling
    });

    this.bot.once(Events.ClientReady, () => {
      console.log(`🤖 Logged in as ${this.bot.user.tag}`);
    });

    this.bot.on(Events.GuildMemberAdd, this.handleNewGuildMember);

    this.bot.login(discordToken);
  }

  async canSendDM(user_id) {
    try {
      const user = await this.bot.users.fetch(user_id);
      const channel = await user.createDM();
      await channel.send("✅ DM test — you can safely ignore this.");

      return true;
    } catch (err) {
      if (err.code === 50007) {
        // Cannot send messages to this user
        return false;
      }

      console.error(`Unexpected error while checking DM permission:`, err);
      return false;
    }
  }

  handleNewGuildMember = async (member) => {
    const targetGuildId = "1396559352541745163";
    if (member.guild.id !== targetGuildId) return;

    console.log(`➡️ New member: ${member.user.tag}`);

    try {
      const dmChannel = await member.user.createDM();
      await dmChannel.send("Welcome! You can now use the dashboard.");
      console.log(`✅ DM sent to ${member.user.tag}`);
      this.handleUserJoin(member.user.id);
    } catch (err) {
      console.error(`❌ Could not DM ${member.user.tag}: ${err.message}`);
    }
  };

  createEmbed(streamer, stream, thumbnailUrl) {
    return new EmbedBuilder()
      .setAuthor({
        name: stream.user_name,
        url: `https://www.twitch.tv/${stream.user_name}`,
        iconURL: streamer.profile_image_url,
      })
      .setColor("PURPLE")
      .setDescription(
        `${stream.user_name} is live on twitch!\n\n**Playing **\n${stream.game_name}`
      )
      .setTitle(stream.title)
      .setUrl(`https://www.twitch.tv/${stream.user_name}`)
      .setThumbnail({
        url: thumbnailUrl,
        height: 720,
        width: 1280,
      })
      .setVideo({
        url: `https://player.twitch.tv/?channel=${stream.user_name}&player=facebook&autoplay=true&parent=meta.tag`,
        height: 378,
        width: 620,
      });
  }

  async handleStreamerOnLive(user_id, streamer, stream, notification_message) {
    const user = await this.bot.users.fetch(user_id);
    const channel = await user.createDM();
    const thumbnailUrl = stream.thumbnail_url
      .replace("{width}", 1280)
      .replace("{height}", 720);
    const embed = this.createEmbed(streamer, stream, thumbnailUrl);

    channel.send({
      content: `${notification_message.replace(
        /%s/g,
        streamer.display_name
      )}\n<https://www.twitch.tv/${stream.user_name}>\n${embed}`,
    });
  }
}

module.exports = { DiscordWrapper };
