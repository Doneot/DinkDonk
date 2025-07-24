// server/deploy-commands.js
const { REST, Routes } = require("discord.js");
const {
  DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID,
  DISCORD_TOKEN,
  NODE_ENV,
} = require("./config");
const fs = require("node:fs");

const commands = [];
const commandFiles = fs
  .readdirSync("./commands")
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log("Registering slash commands...");

    if (NODE_ENV === "production") {
      // Register commands globally
      await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), {
        body: commands,
      });
    } else {
      // Register commands for a specific guild (development)
      await rest.put(
        Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
        { body: commands }
      );
    }

    console.log("Successfully registered commands.");
  } catch (error) {
    console.error(error);
  }
})();
