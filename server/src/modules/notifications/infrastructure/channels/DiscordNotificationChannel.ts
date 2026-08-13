import { logger } from "../../../../shared/logger/logger.js";
import type { IdentityRepository } from "../../../auth/ports/IdentityRepository.js";
import type { User } from "../../../users/domain/User.js";
import type { UserRepository } from "../../../users/ports/UserRepository.js";
import type {
  Notification,
  NotificationResult,
} from "../../domain/Notification.js";

type DiscordMessenger = {
  notifyUser(userId: string, message: string): Promise<void>;

  invalidateDmCapabilityCache(userId: string): void;
};

type DiscordNotificationChannelOptions = {
  discord: DiscordMessenger;

  userRepository: UserRepository;

  identityRepository: IdentityRepository;
};

// Discord error codes that mean this user can never be DM'd again until they
// take some corrective action on their end (re-add the bot, re-open DMs,
// re-create their account) - as opposed to a transient failure worth
// retrying on the next notification. Without treating these as permanent,
// every future live notification re-attempts the same doomed call forever.
const PERMANENT_DM_FAILURE_CODES = new Set([
  50007, // Cannot send messages to this user (DMs closed)
  10013, // Unknown User (account deleted)
  50001, // Missing Access (bot no longer shares a server with this user)
]);

export class DiscordNotificationChannel {
  readonly name = "discord";

  private readonly discord: DiscordMessenger;

  private readonly userRepository: UserRepository;

  private readonly identityRepository: IdentityRepository;

  constructor({
    discord,
    userRepository,
    identityRepository,
  }: DiscordNotificationChannelOptions) {
    this.discord = discord;

    this.userRepository = userRepository;

    this.identityRepository = identityRepository;
  }

  async send(
    user: User | null | undefined,
    notification: Notification,
  ): Promise<NotificationResult> {
    if (!user?.canReceiveDM) {
      return {
        sent: false,

        skipped: true,

        reason: "dm_disabled",
      };
    }

    // user.id is this app's own canonical uid, NOT necessarily the Discord
    // snowflake notifyUser() needs - the two only coincide for Discord-
    // primary signups (see FirestoreIdentityRepository#upsertDiscordIdentity
    // vs. the Google/Twitch upserts, which mint a random uid). Every other
    // Discord-DM call site in this codebase already resolves through
    // identity.discord.id (see authRoutes.ts, apiRoutes.ts,
    // commands/shared/commandReplies.ts's resolveUid) - this one previously
    // didn't, silently breaking DM delivery for any account that linked
    // Discord as a secondary provider.
    const identity = await this.identityRepository.getIdentity(user.id);
    const discordId = identity?.discord?.id;

    if (!discordId) {
      return {
        sent: false,

        skipped: true,

        reason: "dm_disabled",
      };
    }

    try {
      await this.discord.notifyUser(
        discordId,

        `${notification.body}\n${notification.url}`,
      );

      return {
        sent: true,
      };
    } catch (error: unknown) {
      const err = error as {
        code?: number;

        message?: string;
      };

      if (err.code !== undefined && PERMANENT_DM_FAILURE_CODES.has(err.code)) {
        // Evicts any still-fresh cached `true` from an earlier probe -
        // otherwise a routine POST /can-receive-dm or OAuth callback within
        // that cache's TTL would silently overwrite the `false` below back
        // to `true`, since canSendDirectMessage() never touches this write.
        this.discord.invalidateDmCapabilityCache(discordId);

        await this.userRepository.updateUser(user.id, {
          canReceiveDM: false,
        });

        return {
          sent: false,

          expired: true,

          reason: "discord_dm_blocked",
        };
      }

      logger.error(
        {
          userId: user.id,

          message: err.message,
        },
        "Discord notification failed",
      );

      return {
        sent: false,

        reason: err.message || "unknown_error",
      };
    }
  }
}
