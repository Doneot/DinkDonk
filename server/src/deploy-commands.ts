import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REST, Routes } from "discord.js";
import { assertDefined } from "./shared/utils/assert.js";
import { env } from "./shared/config/env.js";
import { logger } from "./shared/logger/logger.js";

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
        pathToFileURL(path.join(commandsDirectory, file)).href
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

  logger.info(
    {
      count: commands.length,
      scope: env.isProduction ? "global" : env.discord.guildId,
    },
    "Registered Discord slash commands",
  );
}

registerCommands().catch((error: unknown) => {
  logger.error({ error }, "Failed to register Discord slash commands");

  logger.flush(() => {
    process.exit(1);
  });
});
