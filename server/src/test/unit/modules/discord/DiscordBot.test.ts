import { EventEmitter } from "node:events";
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
}));

const { DiscordBot } =
  await import("../../../../modules/discord/infrastructure/DiscordBot.js");

const COMMAND_DIRECTORY = path.join(process.cwd(), "src", "commands");

function setup({
  onDmCapabilityChanged,
}: {
  onDmCapabilityChanged?: (
    userId: string,
    canReceiveDM: boolean,
  ) => Promise<void>;
} = {}) {
  const context = {} as CommandContext;

  const bot = new DiscordBot({
    token: "discord-token",
    commandDirectory: COMMAND_DIRECTORY,
    context,
    ...(onDmCapabilityChanged ? { onDmCapabilityChanged } : {}),
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
  } = {},
) {
  return {
    commandName: overrides.commandName ?? "test-command",
    replied: overrides.replied ?? false,
    deferred: overrides.deferred ?? false,
    isChatInputCommand: () => overrides.isChatInputCommand ?? true,
    reply: vi.fn().mockResolvedValue(undefined),
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
        "Discord bot logged in as DinkDonk#0001",
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

    it.each([
      ["replied", { replied: true }],
      ["deferred", { deferred: true }],
    ])(
      "follows up when the interaction was already %s",
      async (_label, state) => {
        const { client } = setup();

        client.commands.set("test-command", {
          data: { name: "test-command" },
          execute: vi.fn().mockRejectedValue(new Error("command exploded")),
        });

        const interaction = createInteraction(state);

        client.emit("interactionCreate", interaction);

        await flush();

        expect(interaction.followUp).toHaveBeenCalledOnce();
        expect(interaction.reply).not.toHaveBeenCalled();
      },
    );

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
