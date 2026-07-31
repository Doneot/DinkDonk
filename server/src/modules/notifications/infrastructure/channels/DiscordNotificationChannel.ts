import { logger } from "../../../../shared/logger/logger.js";
import type { User } from "../../../users/domain/User.js";
import type {
  Notification,
  NotificationResult,
} from "../../domain/Notification.js";
import type { UserRepository } from "../../../users/ports/UserRepository.js";

type DiscordMessenger = {
  notifyUser(userId: string, message: string): Promise<void>;
};

type DiscordNotificationChannelOptions = {
  discord: DiscordMessenger;

  userRepository: UserRepository;
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

  constructor({ discord, userRepository }: DiscordNotificationChannelOptions) {
    this.discord = discord;

    this.userRepository = userRepository;
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

    try {
      await this.discord.notifyUser(
        user.id,

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
