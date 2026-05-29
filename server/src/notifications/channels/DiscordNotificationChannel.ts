import { logger } from "../../utils/logger.js";
import type { User } from "../../types/user.js";
import type {
  Notification,
  NotificationResult,
} from "../../types/notifications.js";

type DiscordService = {
  notifyUser(userId: string, message: string): Promise<void>;
};

type Repository = {
  saveUser(userId: string, data: Partial<User>): Promise<void>;
};

type DiscordNotificationChannelOptions = {
  discord: DiscordService;

  repository: Repository;
};

export class DiscordNotificationChannel {
  readonly name = "discord";

  private readonly discord: DiscordService;

  private readonly repository: Repository;

  constructor({ discord, repository }: DiscordNotificationChannelOptions) {
    this.discord = discord;

    this.repository = repository;
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
        await this.repository.saveUser(user.id, {
          canReceiveDM: false,
        });

        return {
          sent: false,

          expired: true,

          reason: "discord_dm_blocked",
        };
      }

      logger.error("Discord notification failed", {
        userId: user.id,

        message: err.message,
      });

      return {
        sent: false,

        reason: err.message || "unknown_error",
      };
    }
  }
}
