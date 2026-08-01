import path from "node:path";
import { fileURLToPath } from "node:url";

import { TwitchProvider } from "../../modules/twitch/application/TwitchProvider.js";
import { DiscordBot } from "../../modules/discord/infrastructure/DiscordBot.js";

import { env } from "../../shared/config/env.js";
import { assertDefined } from "../../shared/utils/assert.js";

import { TwitchClient } from "../../modules/twitch/infrastructure/TwitchClient.js";

import type { Repositories } from "./repositories.js";
import type { CommandContext } from "../../modules/discord/domain/CommandContext.js";
import type { Runtime } from "../runtime/Runtime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createProviders(repositories: Repositories, runtime: Runtime) {
  const twitch = new TwitchProvider({
    client: new TwitchClient({ publicUrl: runtime.publicUrl }),
  });

  const context: CommandContext = {
    twitch: twitch.client,
    userRepository: repositories.users,
    identityRepository: repositories.identities,
    streamerRepository: repositories.streamers,
  };

  const discord = new DiscordBot({
    token: assertDefined(env.discord.token, "Discord token"),

    commandDirectory: path.join(__dirname, "../../commands"),

    context,

    onDmCapabilityChanged: (userId, canReceiveDM) =>
      repositories.users.updateUser(userId, { canReceiveDM }),
  });

  return {
    twitch,
    discord,
  };
}
