const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, MessageFlags, Partials } = require('discord.js');
const { logger } = require('../utils/logger');

class DiscordBot {
  constructor({ token, commandDirectory, context, onDmCapabilityChanged }) {
    this.token = token;
    this.context = context;
    this.onDmCapabilityChanged = onDmCapabilityChanged;
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages],
      partials: [Partials.Channel],
    });
    this.client.commands = new Collection();
    this.loadCommands(commandDirectory);
    this.registerEventHandlers();
  }

  get isReady() {
    return this.client.isReady();
  }

  async start() {
    await this.client.login(this.token);
  }

  async stop() {
    this.client.destroy();
  }

  loadCommands(commandDirectory) {
    fs.readdirSync(commandDirectory)
      .filter((file) => file.endsWith('.js'))
      .forEach((file) => {
        const command = require(path.join(commandDirectory, file));
        this.client.commands.set(command.data.name, command);
      });
  }

  registerEventHandlers() {
    this.client.once(Events.ClientReady, () => logger.info(`Discord bot logged in as ${this.client.user.tag}`));
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      const command = this.client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction, this.context);
      } catch (error) {
        logger.error('Discord command failed', { command: interaction.commandName, message: error.message });
        const payload = { content: 'There was an error while running this command.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
        else await interaction.reply(payload);
      }
    });
  }

  async canSendDirectMessage(userId) {
    try {
      const user = await this.client.users.fetch(userId);
      const channel = await user.createDM();
      await channel.send('✅ DM test — you can safely ignore this.');
      return true;
    } catch (error) {
      if (error.code !== 50007) logger.error('Unexpected DM capability error', { userId, message: error.message });
      return false;
    }
  }

  async notifyStreamerLive(userId, streamer, template) {
    try {
      const user = await this.client.users.fetch(userId);
      const channel = await user.createDM();
      const message = (template || '%s is live!').replace(/%s/g, streamer.display_name);
      await channel.send(`${message}\nhttps://www.twitch.tv/${streamer.login}`);
    } catch (error) {
      if (error.code === 50007 && this.onDmCapabilityChanged) {
        await this.onDmCapabilityChanged(userId, false);
        return;
      }
      logger.error('Failed to send live notification', { userId, streamer: streamer.display_name, message: error.message });
    }
  }
}

module.exports = { DiscordBot };
