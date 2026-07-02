import { logger } from "../../../../shared/logger/logger.js";
import type { User } from "../../../users/domain/User.js";
import type {
  Notification,
  NotificationResult,
} from "../../domain/Notification.js";
import type { UserRepository } from "../../../users/ports/UserRepository.js";

type DiscordService = {
  notifyUser(userId: string, message: string): Promise<void>;
};

type DiscordNotificationChannelOptions = {
  discord: DiscordService;

  userRepository: UserRepository;
};

export class DiscordNotificationChannel {
  readonly name = "discord";

  private readonly discord: DiscordService;

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

      if (err.code === 50007) {
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
