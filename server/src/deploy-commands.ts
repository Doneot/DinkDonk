import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REST, Routes } from "discord.js";
import { assertDefined } from "./shared/utils/assert.js";
import { env } from "./shared/config/env.js";

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

type CommandModule = {
  data: {
    toJSON(): unknown;
  };
};

const commandsDirectory = path.join(__dirname, "commands");

const commandFiles = fs
  .readdirSync(commandsDirectory)
  .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

async function registerCommands(): Promise<void> {
  const commands = await Promise.all(
    commandFiles.map(async (file): Promise<unknown> => {
      const command = (await import(
        path.join(commandsDirectory, file)
      )) as CommandModule;

      return command.data.toJSON();
    }),
  );

  const rest = new REST({
    version: "10",
  }).setToken(assertDefined(env.discord.token, "Discord Bot Token"));

  const route = env.isProduction
    ? Routes.applicationCommands(
        assertDefined(env.discord.clientId, "Discord Client ID"),
      )
    : Routes.applicationGuildCommands(
        assertDefined(env.discord.clientId, "Discord Client ID"),

        assertDefined(env.discord.guildId, "Discord Guild ID"),
      );

  await rest.put(route, {
    body: commands,
  });

  const scope = env.isProduction
    ? "globally"
    : `for guild ${env.discord.guildId}`;

  console.log(`Registered ${commands.length} Discord slash commands ${scope}.`);
}

registerCommands().catch((error: unknown): never => {
  console.error("Failed to register Discord slash commands:", error);

  process.exit(1);
});
