import type { User } from "../../users/domain/User.js";

export type Notification = {
  type: string;

  title: string;

  body: string;

  url: string;

  streamer?: {
    id: string;

    login: string;

    displayName: string;

    avatar?: string;
  };
};

export type NotificationResult = {
  sent: boolean;

  skipped?: boolean;

  expired?: boolean;

  reason?: string;
};

export interface NotificationChannel {
  name: string;

  send(user: User, notification: Notification): Promise<NotificationResult>;
}
