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

// The HTTP API sits behind express-rate-limit; slash commands had no
// equivalent, and several (subscribe/unsubscribe/list) each make a live
// Twitch Helix request using the single shared app-token client before
// doing anything else - a spamming user could burn a disproportionate share
// of that shared, app-wide (not per-caller) Twitch rate-limit budget purely
// by invoking commands back-to-back, degrading Twitch access for every
// other user of the deployment. Generous enough for real usage, tight
// enough to meaningfully throttle abuse - fixed-window per Discord user,
// same shape as the HTTP limiter's window+count approach. In-memory is
// sufficient since the bot itself doesn't run multiple replicas (unlike the
// HTTP server, which is Redis-backed for exactly that reason).
const COMMAND_RATE_LIMIT_WINDOW_MS = 10 * 1000;
const COMMAND_RATE_LIMIT_MAX = 5;
const COMMAND_RATE_LIMIT_SWEEP_INTERVAL_MS = 60 * 1000;

type DiscordClient = Client & {
  commands: Collection<string, Command>;
};

export class DiscordBot implements DiscordService {
  private readonly token: string;

  private readonly commandDirectory: string;

  private readonly context: CommandContext;

  private readonly client: DiscordClient;

  private readonly dmCapabilityCache = new Map<
    string,
    { result: boolean; expiresAt: number }
  >();

  // See canSendDirectMessage's comment: memoizes an in-progress probe so
  // concurrent callers for the same userId share one real DM send instead
  // of each triggering their own.
  private readonly dmCapabilityProbesInFlight = new Map<
    string,
    Promise<boolean>
  >();

  private readonly dmCapabilityCacheSweep: NodeJS.Timeout;

  private readonly commandInvocations = new Map<
    string,
    { count: number; windowStart: number }
  >();

  private readonly commandRateLimitSweep: NodeJS.Timeout;

  constructor({ token, commandDirectory, context }: DiscordBotOptions) {
    this.token = token;

    this.commandDirectory = commandDirectory;

    this.context = context;

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

    // Without a sweep, every unique Discord user who ever invokes a command
    // would leave a permanent entry here for the life of the process, same
    // rationale as dmCapabilityCacheSweep above.
    this.commandRateLimitSweep = setInterval(() => {
      const now = Date.now();

      for (const [userId, entry] of this.commandInvocations) {
        if (now - entry.windowStart >= COMMAND_RATE_LIMIT_WINDOW_MS) {
          this.commandInvocations.delete(userId);
        }
      }
    }, COMMAND_RATE_LIMIT_SWEEP_INTERVAL_MS);

    this.commandRateLimitSweep.unref();
  }

  /** True (and records the attempt) if this Discord user is over the command rate limit. */
  private isRateLimited(discordUserId: string): boolean {
    const now = Date.now();
    const entry = this.commandInvocations.get(discordUserId);

    if (!entry || now - entry.windowStart >= COMMAND_RATE_LIMIT_WINDOW_MS) {
      this.commandInvocations.set(discordUserId, { count: 1, windowStart: now });

      return false;
    }

    entry.count += 1;

    return entry.count > COMMAND_RATE_LIMIT_MAX;
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

    clearInterval(this.commandRateLimitSweep);

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

      if (this.client.commands.has(commandModule.data.name)) {
        logger.warn(
          { file, command: commandModule.data.name },
          "Command name already registered by another file; overwriting the earlier registration",
        );
      }

      this.client.commands.set(commandModule.data.name, commandModule as Command);
    }
  }

  // Best-effort: the interaction may already be unusable by the time this
  // runs (past Discord's ~3s initial-ack window if the command did slow I/O
  // first, a dropped gateway connection, etc.), in which case reply()/
  // followUp() itself rejects. Letting that reject unhandled would crash the
  // entire process - InteractionCreate's listener is an async EventEmitter
  // callback, so a rejection here isn't caught by discord.js and instead hits
  // app/index.ts's global unhandledRejection handler, which calls
  // process.exit(1) - taking down the HTTP API and EventSub webhook consumer
  // along with the bot, over what's ultimately just a failed Discord reply.
  private async safeReply(
    interaction: ChatInputCommandInteraction,
    payload: InteractionReplyOptions,
  ): Promise<void> {
    try {
      // Three distinct states, not two: `replied` alone doesn't tell the
      // whole story since editReply() also sets it (see discord.js's
      // InteractionResponses) - a command that called deferReply() and
      // hasn't replied yet (e.g. it threw before reaching its own
      // replyEphemeral()/editReply() call) has deferred=true, replied=false,
      // and needs editReply() to fill that still-pending placeholder.
      // followUp() would instead post a second, disconnected message and
      // leave the original "thinking..." response stuck forever, since
      // nothing else ever resolves it. `replied` is checked first because
      // it can be true independent of `deferred` (a non-deferred reply()
      // already sent, with this call meant to send a follow-up message).
      if (interaction.replied) {
        await interaction.followUp(payload);
      } else if (interaction.deferred) {
        // editReply() can't accept `flags` (ephemerality was already fixed
        // by the initial deferReply()) - both call sites below only ever
        // pass `content`.
        await interaction.editReply({ content: payload.content ?? null });
      } else {
        await interaction.reply(payload);
      }
    } catch (error: unknown) {
      logger.error(
        {
          command: interaction.commandName,

          message: error instanceof Error ? error.message : String(error),
        },
        "Failed to reply to a Discord interaction",
      );
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

        if (this.isRateLimited(interaction.user.id)) {
          await this.safeReply(interaction, {
            content: "You're using commands too quickly - please wait a few seconds and try again.",

            flags: MessageFlags.Ephemeral,
          });

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

          await this.safeReply(interaction, {
            content: "There was an error while running this command.",

            flags: MessageFlags.Ephemeral,
          });
        }
      },
    );
  }

  // Called when a REAL notification send just hit a permanent DM failure
  // (see DiscordNotificationChannel's PERMANENT_DM_FAILURE_CODES branch),
  // which writes canReceiveDM: false straight to Firestore without going
  // through canSendDirectMessage/this cache at all. Without evicting the
  // entry here, a still-fresh cached `true` from an earlier probe (e.g. the
  // last 5 minutes) would let a routine POST /can-receive-dm or OAuth
  // callback silently overwrite that just-corrected `false` back to `true`,
  // undoing the whole point of tracking permanent failures.
  invalidateDmCapabilityCache(userId: string): void {
    this.dmCapabilityCache.delete(userId);
  }

  async canSendDirectMessage(userId: string): Promise<boolean> {
    const cached = this.dmCapabilityCache.get(userId);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    // Memoized by in-flight promise, not just the TTL cache above: three
    // independent HTTP routes call this (GET /api/auth/user's self-heal
    // branch, POST /api/can-receive-dm, every OAuth callback), so two
    // concurrent calls for the same userId - duplicate frontend requests,
    // two tabs completing OAuth around the same time - would otherwise both
    // miss the cache and each send their own real, visible probe DM, which
    // is exactly the repeat-spam this cache exists to prevent (see its
    // top-of-file comment).
    const inFlight = this.dmCapabilityProbesInFlight.get(userId);

    if (inFlight) {
      return inFlight;
    }

    const probe = this.probeDirectMessageCapability(userId).then((result) => {
      this.dmCapabilityCache.set(userId, {
        result,
        expiresAt: Date.now() + DM_CAPABILITY_CACHE_TTL_MS,
      });

      return result;
    });

    this.dmCapabilityProbesInFlight.set(userId, probe);

    try {
      return await probe;
    } finally {
      this.dmCapabilityProbesInFlight.delete(userId);
    }
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
