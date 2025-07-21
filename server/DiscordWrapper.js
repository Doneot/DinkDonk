const {
  Client,
  GatewayIntentBits,
  Events,
  Partials,
} = require("discord.js");

class DiscordWrapper {
  constructor(discordToken, handleUserJoin, handleUserUpdateDMability) {
    this.token = discordToken;
    this.handleUserJoin = handleUserJoin;
    this.handleUserUpdateDMability = handleUserUpdateDMability;
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

  async handleStreamerOnLive(user_id, streamer, notification_message) {
    try {
      const user = await this.bot.users.fetch(user_id);
      const channel = await user.createDM();

      await channel.send({
        content: `${notification_message.replace(/%s/g, streamer.display_name)}\nhttps://www.twitch.tv/${streamer.login}`
      });
    } catch (err) {
      if (err.code === 50007) {
        this.handleUserUpdateDMability(user_id, false);
        return;
      }
      console.error(`❌ Could not notify user ${user_id} about streamer ${streamer.display_name}:`, err);
    }
  }
}

module.exports = { DiscordWrapper };
