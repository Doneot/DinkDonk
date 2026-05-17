const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');
const { env, assertRequiredEnv } = require('./src/config/env');

assertRequiredEnv();

const commandsDirectory = path.join(__dirname, 'commands');
const commands = fs
  .readdirSync(commandsDirectory)
  .filter((file) => file.endsWith('.js'))
  .map((file) => require(path.join(commandsDirectory, file)).data.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(env.discord.token);
  const route = env.isProduction
    ? Routes.applicationCommands(env.discord.clientId)
    : Routes.applicationGuildCommands(env.discord.clientId, env.discord.guildId);

  await rest.put(route, { body: commands });

  const scope = env.isProduction ? 'globally' : `for guild ${env.discord.guildId}`;
  console.log(`Registered ${commands.length} Discord slash commands ${scope}.`);
}

registerCommands().catch((error) => {
  console.error('Failed to register Discord slash commands:', error);
  process.exit(1);
});
