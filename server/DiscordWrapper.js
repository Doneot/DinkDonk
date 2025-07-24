// server/DiscordWrapper.js
const {
  Client,
  GatewayIntentBits,
  Events,
  Partials,
  Collection,
  MessageFlags,
} = require("discord.js");
const fs = require("node:fs");

class DiscordWrapper {
  constructor(discordToken, handleUserUpdateDMability, context) {
    this.token = discordToken;
    this.handleUserUpdateDMability = handleUserUpdateDMability;
    this.context = context;
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

    this.bot.commands = new Collection();

    const commandFiles = fs
      .readdirSync("./commands")
      .filter((file) => file.endsWith(".js"));
    for (const file of commandFiles) {
      const command = require(`./commands/${file}`);
      this.bot.commands.set(command.data.name, command);
    }

    this.bot.once(Events.ClientReady, () => {
      console.log(`🤖 Logged in as ${this.bot.user.tag}`);
    });

    this.bot.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = this.bot.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction, this.context);
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: "There was an error!",
          flags: MessageFlags.Ephemeral,
        });
      }
    });

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

  async handleStreamerOnLive(user_id, streamer, notification_message) {
    try {
      const user = await this.bot.users.fetch(user_id);
      const channel = await user.createDM();

      await channel.send({
        content: `${notification_message.replace(
          /%s/g,
          streamer.display_name
        )}\nhttps://www.twitch.tv/${streamer.login}`,
      });
    } catch (err) {
      if (err.code === 50007) {
        this.handleUserUpdateDMability(user_id, false);
        return;
      }
      console.error(
        `❌ Could not notify user ${user_id} about streamer ${streamer.display_name}:`,
        err
      );
    }
  }
}

module.exports = { DiscordWrapper };
