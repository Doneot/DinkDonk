import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CommandContext } from "../../../../modules/discord/domain/CommandContext.js";
import { logger } from "../../../../shared/logger/logger.js";

type Command = {
  data: { name: string };
  execute: (interaction: unknown, context: CommandContext) => Promise<void>;
};

class MockCollection<K, V> extends Map<K, V> {}

class MockOptionBuilder {
  setName(): this {
    return this;
  }

  setDescription(): this {
    return this;
  }

  setRequired(): this {
    return this;
  }

  setMaxLength(): this {
    return this;
  }
}

class MockSlashCommandBuilder {
  name = "";

  setName(name: string): this {
    this.name = name;

    return this;
  }

  setDescription(): this {
    return this;
  }

  addStringOption(configure: (option: MockOptionBuilder) => unknown): this {
    configure(new MockOptionBuilder());

    return this;
  }

  setDefaultMemberPermissions(): this {
    return this;
  }

  setContexts(): this {
    return this;
  }
}

const clients: MockClient[] = [];

class MockClient extends EventEmitter {
  commands = new MockCollection<string, Command>();

  user: { tag: string } | null = null;

  ready = false;

  send = vi.fn().mockResolvedValue(undefined);

  createDM = vi.fn(() => Promise.resolve({ send: this.send }));

  users = {
    fetch: vi.fn(() => Promise.resolve({ createDM: this.createDM })),
  };

  login = vi.fn().mockResolvedValue("token");

  destroy = vi.fn().mockResolvedValue(undefined);

  constructor() {
    super();

    clients.push(this);
  }

  isReady(): boolean {
    return this.ready;
  }
}

vi.mock("discord.js", () => ({
  Client: MockClient,
  Collection: MockCollection,
  SlashCommandBuilder: MockSlashCommandBuilder,
  Events: {
    ClientReady: "ready",
    InteractionCreate: "interactionCreate",
  },
  GatewayIntentBits: { Guilds: 1, GuildMembers: 2, DirectMessages: 4 },
  MessageFlags: { Ephemeral: 64 },
  Partials: { Channel: 1 },
  PermissionFlagsBits: { Administrator: 8 },
  InteractionContextType: { Guild: 0, BotDM: 1, PrivateChannel: 2 },
}));

const { DiscordBot } =
  await import("../../../../modules/discord/infrastructure/DiscordBot.js");

const COMMAND_DIRECTORY = path.join(process.cwd(), "src", "commands");

function setup({
  commandDirectory = COMMAND_DIRECTORY,
}: {
  commandDirectory?: string;
} = {}) {
  const context = {} as CommandContext;

  const bot = new DiscordBot({
    token: "discord-token",
    commandDirectory,
    context,
  });

  const client = clients.at(-1);

  if (!client) {
    throw new Error("Discord client was not constructed");
  }

  return { bot, client, context };
}

function createInteraction(
  overrides: {
    commandName?: string;
    isChatInputCommand?: boolean;
    replied?: boolean;
    deferred?: boolean;
    userId?: string;
  } = {},
) {
  return {
    commandName: overrides.commandName ?? "test-command",
    replied: overrides.replied ?? false,
    deferred: overrides.deferred ?? false,
    isChatInputCommand: () => overrides.isChatInputCommand ?? true,
    user: { id: overrides.userId ?? "discord-user-1" },
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
  };
}

function discordError(code: number, message = "Cannot send messages") {
  return Object.assign(new Error(message), { code });
}

/** Waits for the async listeners registered on the mock client to settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  clients.length = 0;
  vi.spyOn(logger, "info").mockReturnValue();
  vi.spyOn(logger, "error").mockReturnValue();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DiscordBot", () => {
  describe("lifecycle", () => {
    it("reports readiness from the underlying client", () => {
      const { bot, client } = setup();

      expect(bot.isReady).toBe(false);

      client.ready = true;

      expect(bot.isReady).toBe(true);
    });

    it("loads the command modules and logs in", async () => {
      const { bot, client } = setup();

      await bot.start();

      expect([...client.commands.keys()].sort()).toEqual([
        "dashboard",
        "get-subscriptions",
        "help",
        "list",
        "set-message",
        "subscribe",
        "unsubscribe",
      ]);
      expect(client.login).toHaveBeenCalledWith("discord-token");
    });

    it("warns and keeps the later registration when two command files share the same name", async () => {
      const warn = vi.spyOn(logger, "warn").mockReturnValue();
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), "dinkdonk-duplicate-commands-"),
      );

      try {
        const source =
          'export const data = { name: "dup", toJSON: () => ({ name: "dup" }) };\n' +
          "export async function execute() {}\n";

        fs.writeFileSync(path.join(dir, "a-first.js"), source);
        fs.writeFileSync(path.join(dir, "b-second.js"), source);

        const { bot, client } = setup({ commandDirectory: dir });

        await bot.start();

        expect(client.commands.size).toBe(1);
        expect(warn).toHaveBeenCalledWith(
          expect.objectContaining({ command: "dup" }),
          "Command name already registered by another file; overwriting the earlier registration",
        );
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it("destroys the client on stop", async () => {
      const { bot, client } = setup();

      await bot.stop();

      expect(client.destroy).toHaveBeenCalledOnce();
    });

    it("logs the bot identity once the client is ready", () => {
      const info = vi.spyOn(logger, "info").mockReturnValue();
      const { client } = setup();

      client.user = { tag: "DinkDonk#0001" };
      client.emit("ready");

      expect(info).toHaveBeenCalledWith(
        { tag: "DinkDonk#0001" },
        "Discord bot logged in",
      );
    });

    it("stays quiet when the ready event arrives without a user", () => {
      const info = vi.spyOn(logger, "info").mockReturnValue();
      const { client } = setup();

      client.emit("ready");

      expect(info).not.toHaveBeenCalled();
    });
  });

  describe("interaction handling", () => {
    it("executes the matching command with the shared context", async () => {
      const { client, context } = setup();
      const execute = vi.fn().mockResolvedValue(undefined);

      client.commands.set("test-command", {
        data: { name: "test-command" },
        execute,
      });

      const interaction = createInteraction();

      client.emit("interactionCreate", interaction);

      await flush();

      expect(execute.mock.calls).toEqual([[interaction, context]]);
    });

    it("ignores interactions that are not chat input commands", async () => {
      const { client } = setup();
      const execute = vi.fn();

      client.commands.set("test-command", {
        data: { name: "test-command" },
        execute,
      });

      client.emit(
        "interactionCreate",
        createInteraction({ isChatInputCommand: false }),
      );

      await flush();

      expect(execute).not.toHaveBeenCalled();
    });

    it("ignores an unregistered command", async () => {
      const { client } = setup();
      const interaction = createInteraction({ commandName: "unknown" });

      client.emit("interactionCreate", interaction);

      await flush();

      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it("rate-limits a user who invokes commands too quickly, without running the command", async () => {
      const { client } = setup();
      const execute = vi.fn().mockResolvedValue(undefined);

      client.commands.set("test-command", {
        data: { name: "test-command" },
        execute,
      });

      // COMMAND_RATE_LIMIT_MAX is 5 within the window - the 6th invocation
      // from the same Discord user in quick succession should be rejected.
      for (let i = 0; i < 5; i += 1) {
        client.emit("interactionCreate", createInteraction());
      }

      const limited = createInteraction();

      client.emit("interactionCreate", limited);

      await flush();

      expect(execute).toHaveBeenCalledTimes(5);
      expect(limited.reply).toHaveBeenCalledWith({
        content:
          "You're using commands too quickly - please wait a few seconds and try again.",
        flags: 64,
      });
    });

    it("rate-limits each Discord user independently", async () => {
      const { client } = setup();
      const execute = vi.fn().mockResolvedValue(undefined);

      client.commands.set("test-command", {
        data: { name: "test-command" },
        execute,
      });

      for (let i = 0; i < 5; i += 1) {
        client.emit(
          "interactionCreate",
          createInteraction({ userId: "discord-user-1" }),
        );
      }

      const otherUser = createInteraction({ userId: "discord-user-2" });

      client.emit("interactionCreate", otherUser);

      await flush();

      expect(execute).toHaveBeenCalledTimes(6);
      expect(otherUser.reply).not.toHaveBeenCalled();
    });

    it("replies with an ephemeral error when the command throws", async () => {
      const error = vi.spyOn(logger, "error").mockReturnValue();
      const { client } = setup();

      client.commands.set("test-command", {
        data: { name: "test-command" },
        execute: vi.fn().mockRejectedValue(new Error("command exploded")),
      });

      const interaction = createInteraction();

      client.emit("interactionCreate", interaction);

      await flush();

      expect(interaction.reply.mock.calls).toEqual([
        [
          {
            content: "There was an error while running this command.",
            flags: 64,
          },
        ],
      ]);
      expect(error.mock.calls[0]?.[0]).toMatchObject({
        command: "test-command",
        message: "command exploded",
      });
    });

    it("logs (rather than crashing the process) when both the command and the fallback reply fail", async () => {
      const error = vi.spyOn(logger, "error").mockReturnValue();
      const { client } = setup();

      client.commands.set("test-command", {
        data: { name: "test-command" },
        execute: vi.fn().mockRejectedValue(new Error("command exploded")),
      });

      const interaction = createInteraction();

      // The interaction itself has become unusable by the time the fallback
      // error reply is attempted (e.g. Discord's ~3s ack window already
      // elapsed) - this second failure must not propagate as an unhandled
      // rejection, which app/index.ts's global handler treats as fatal for
      // the entire process, not just this one command.
      interaction.reply.mockRejectedValue(new Error("Unknown interaction"));

      client.emit("interactionCreate", interaction);

      await flush();

      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({
          command: "test-command",
          message: "Unknown interaction",
        }),
        "Failed to reply to a Discord interaction",
      );
    });

    it("follows up when the interaction has already been replied to", async () => {
      const { client } = setup();

      client.commands.set("test-command", {
        data: { name: "test-command" },
        execute: vi.fn().mockRejectedValue(new Error("command exploded")),
      });

      const interaction = createInteraction({ replied: true });

      client.emit("interactionCreate", interaction);

      await flush();

      expect(interaction.followUp).toHaveBeenCalledOnce();
      expect(interaction.editReply).not.toHaveBeenCalled();
      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it("edits the deferred reply, rather than posting a disconnected follow-up, when the interaction was deferred but never actually replied to", async () => {
      // A command that calls deferReply() as its first line (subscribe,
      // unsubscribe, list, set-message, get-subscriptions) and then throws
      // before reaching its own reply - e.g. a Twitch/Firestore call inside
      // execute() rejects - leaves the interaction deferred=true,
      // replied=false. followUp() would post a second, disconnected message
      // while leaving the original "thinking..." placeholder stuck forever,
      // since nothing else ever resolves it.
      const { client } = setup();

      client.commands.set("test-command", {
        data: { name: "test-command" },
        execute: vi.fn().mockRejectedValue(new Error("command exploded")),
      });

      const interaction = createInteraction({ deferred: true });

      client.emit("interactionCreate", interaction);

      await flush();

      expect(interaction.editReply).toHaveBeenCalledOnce();
      expect(interaction.followUp).not.toHaveBeenCalled();
      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it("normalizes a non-Error command failure", async () => {
      const error = vi.spyOn(logger, "error").mockReturnValue();
      const { client } = setup();

      client.commands.set("test-command", {
        data: { name: "test-command" },
        execute: vi.fn().mockRejectedValue("string failure"),
      });

      client.emit("interactionCreate", createInteraction());

      await flush();

      expect(error.mock.calls[0]?.[0]).toMatchObject({
        message: "string failure",
      });
    });
  });

  describe("canSendDirectMessage", () => {
    it("returns true after a probe message is delivered", async () => {
      const { bot, client } = setup();

      await expect(bot.canSendDirectMessage("user-1")).resolves.toBe(true);

      expect(client.users.fetch).toHaveBeenCalledWith("user-1");
      expect(client.send).toHaveBeenCalledOnce();
    });

    it("returns false without logging when the user blocks DMs", async () => {
      const error = vi.spyOn(logger, "error").mockReturnValue();
      const { bot, client } = setup();

      client.send.mockRejectedValue(discordError(50007));

      await expect(bot.canSendDirectMessage("user-1")).resolves.toBe(false);

      expect(error).not.toHaveBeenCalled();
    });

    it("logs and returns false for an unexpected failure", async () => {
      const error = vi.spyOn(logger, "error").mockReturnValue();
      const { bot, client } = setup();

      client.users.fetch.mockRejectedValue(discordError(10013, "Unknown user"));

      await expect(bot.canSendDirectMessage("user-1")).resolves.toBe(false);

      expect(error.mock.calls[0]?.[0]).toMatchObject({
        userId: "user-1",
        message: "Unknown user",
      });
    });

    describe("result caching", () => {
      afterEach(() => {
        vi.useRealTimers();
      });

      it("skips a second probe DM for the same user within the TTL window", async () => {
        vi.useFakeTimers();
        const { bot, client } = setup();

        await expect(bot.canSendDirectMessage("user-1")).resolves.toBe(true);

        vi.advanceTimersByTime(4 * 60 * 1000);

        await expect(bot.canSendDirectMessage("user-1")).resolves.toBe(true);

        expect(client.users.fetch).toHaveBeenCalledOnce();
        expect(client.send).toHaveBeenCalledOnce();
      });

      it("re-probes once the TTL window has elapsed", async () => {
        vi.useFakeTimers();
        const { bot, client } = setup();

        await expect(bot.canSendDirectMessage("user-1")).resolves.toBe(true);

        // DM_CAPABILITY_CACHE_TTL_MS is 5 minutes.
        vi.advanceTimersByTime(5 * 60 * 1000 + 1);

        await expect(bot.canSendDirectMessage("user-1")).resolves.toBe(true);

        expect(client.users.fetch).toHaveBeenCalledTimes(2);
        expect(client.send).toHaveBeenCalledTimes(2);
      });

      it("caches per user rather than globally", async () => {
        vi.useFakeTimers();
        const { bot, client } = setup();

        await expect(bot.canSendDirectMessage("user-1")).resolves.toBe(true);
        await expect(bot.canSendDirectMessage("user-2")).resolves.toBe(true);

        expect(client.users.fetch).toHaveBeenCalledTimes(2);
        expect(client.users.fetch).toHaveBeenCalledWith("user-1");
        expect(client.users.fetch).toHaveBeenCalledWith("user-2");
      });

      it("shares one in-flight probe across concurrent calls for the same user, instead of sending a duplicate probe DM", async () => {
        const { bot, client } = setup();

        const [first, second] = await Promise.all([
          bot.canSendDirectMessage("user-1"),
          bot.canSendDirectMessage("user-1"),
        ]);

        expect(first).toBe(true);
        expect(second).toBe(true);
        expect(client.users.fetch).toHaveBeenCalledOnce();
        expect(client.send).toHaveBeenCalledOnce();
      });
    });
  });

  describe("notifyUser", () => {
    it("sends the message to the user's DM channel", async () => {
      const { bot, client } = setup();

      await bot.notifyUser("user-1", "hello");

      expect(client.send).toHaveBeenCalledWith("hello");
    });

    it("propagates a Discord failure", async () => {
      const { bot, client } = setup();

      client.send.mockRejectedValue(discordError(50007));

      await expect(bot.notifyUser("user-1", "hello")).rejects.toThrow();
    });
  });

});
