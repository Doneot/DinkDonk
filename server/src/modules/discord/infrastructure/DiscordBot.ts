import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
} from "discord.js";

import { logger } from "../../../shared/logger/logger.js";

import type { CommandContext } from "../domain/CommandContext.js";
import type { DiscordService } from "../ports/DiscordService.js";

type Command = {
  data: {
    name: string;
  };

  execute(
    interaction: ChatInputCommandInteraction,
    context: CommandContext,
  ): Promise<void>;
};

type DiscordBotOptions = {
  token: string;

  commandDirectory: string;

  context: CommandContext;

  onDmCapabilityChanged?: (
    userId: string,
    canReceiveDM: boolean,
  ) => Promise<void>;
};

type DiscordApiError = Error & {
  code?: number;
};

// canSendDirectMessage sends a real, visible probe DM - caching the result
// avoids spamming a user with repeat "you can safely ignore this" messages
// if the HTTP paths that call it (POST /can-receive-dm, OAuth callbacks) are
// hit repeatedly in quick succession.
const DM_CAPABILITY_CACHE_TTL_MS = 5 * 60 * 1000;

// Without a sweep, every unique user who is ever DM-capability-checked would
// leave a permanent entry here for the life of the process, since expired
// entries are otherwise only overwritten (not removed) on that user's next
// check - unbounded growth on a long-running instance.
const DM_CAPABILITY_CACHE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

type DiscordClient = Client & {
  commands: Collection<string, Command>;
};

export class DiscordBot implements DiscordService {
  private readonly token: string;

  private readonly commandDirectory: string;

  private readonly context: CommandContext;

  private readonly onDmCapabilityChanged:
    | ((userId: string, canReceiveDM: boolean) => Promise<void>)
    | undefined;

  private readonly client: DiscordClient;

  private readonly dmCapabilityCache = new Map<
    string,
    { result: boolean; expiresAt: number }
  >();

  private readonly dmCapabilityCacheSweep: NodeJS.Timeout;

  constructor({
    token,
    commandDirectory,
    context,
    onDmCapabilityChanged,
  }: DiscordBotOptions) {
    this.token = token;

    this.commandDirectory = commandDirectory;

    this.context = context;

    this.onDmCapabilityChanged = onDmCapabilityChanged;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
      ],

      partials: [Partials.Channel],
    }) as DiscordClient;

    this.client.commands = new Collection<string, Command>();

    this.registerEventHandlers();

    this.dmCapabilityCacheSweep = setInterval(() => {
      const now = Date.now();

      for (const [userId, entry] of this.dmCapabilityCache) {
        if (entry.expiresAt <= now) {
          this.dmCapabilityCache.delete(userId);
        }
      }
    }, DM_CAPABILITY_CACHE_SWEEP_INTERVAL_MS);

    this.dmCapabilityCacheSweep.unref();
  }

  get isReady(): boolean {
    return this.client.isReady();
  }

  async start(): Promise<void> {
    await this.loadCommands(this.commandDirectory);
    await this.client.login(this.token);
  }

  async stop(): Promise<void> {
    clearInterval(this.dmCapabilityCacheSweep);

    await this.client.destroy();
  }

  private async loadCommands(commandDirectory: string): Promise<void> {
    // Accept both source (.ts, run via tsx in dev) and compiled (.js, run in
    // production) command modules; source maps (.js.map) are excluded.
    const files = fs
      .readdirSync(commandDirectory)
      .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

    for (const file of files) {
      const modulePath = path.join(commandDirectory, file);

      const commandModule = (await import(
        pathToFileURL(modulePath).href
      )) as Partial<Command>;

      if (
        typeof commandModule.data?.name !== "string" ||
        typeof commandModule.execute !== "function"
      ) {
        logger.warn(
          { file },
          "Skipping command module: missing data.name or execute export",
        );

        continue;
      }

      this.client.commands.set(commandModule.data.name, commandModule as Command);
    }
  }

  private registerEventHandlers(): void {
    this.client.once(Events.ClientReady, () => {
      if (!this.client.user) {
        return;
      }

      logger.info({ tag: this.client.user.tag }, "Discord bot logged in");
    });

    this.client.on(
      Events.InteractionCreate,

      async (interaction): Promise<void> => {
        if (!interaction.isChatInputCommand()) {
          return;
        }

        const command = this.client.commands.get(interaction.commandName);

        if (!command) {
          return;
        }

        try {
          await command.execute(interaction, this.context);
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));

          logger.error(
            {
              command: interaction.commandName,

              message: err.message,
            },
            "Discord command failed",
          );

          const payload: InteractionReplyOptions = {
            content: "There was an error while running this command.",

            flags: MessageFlags.Ephemeral,
          };

          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(payload);

            return;
          }

          await interaction.reply(payload);
        }
      },
    );
  }

  async canSendDirectMessage(userId: string): Promise<boolean> {
    const cached = this.dmCapabilityCache.get(userId);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const result = await this.probeDirectMessageCapability(userId);

    this.dmCapabilityCache.set(userId, {
      result,
      expiresAt: Date.now() + DM_CAPABILITY_CACHE_TTL_MS,
    });

    return result;
  }

  private async probeDirectMessageCapability(userId: string): Promise<boolean> {
    try {
      const user = await this.client.users.fetch(userId);

      const channel = await user.createDM();

      await channel.send("✅ DM test — you can safely ignore this.");

      return true;
    } catch (error: unknown) {
      const err = error as DiscordApiError;

      if (err.code !== 50007) {
        logger.error(
          {
            userId,

            message: err.message,
          },
          "Unexpected DM capability error",
        );
      }

      return false;
    }
  }

  async notifyUser(userId: string, content: string): Promise<void> {
    const user = await this.client.users.fetch(userId);

    const channel = await user.createDM();

    await channel.send(content);
  }
}
