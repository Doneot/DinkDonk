import type { PushSubscriptionRecord } from "./pushSubscription.js";

export interface UserStreamerSubscription {
  id: string;

  notification_message: string;
}

export interface User {
  accessToken?: string;

  avatar?: string;

  canReceiveDM?: boolean;

  discriminator?: string;

  fetchTime?: number;

  id: string;

  refreshToken?: string;

  streamers?: UserStreamerSubscription[];

  username?: string;

  pushSubscriptions?: PushSubscriptionRecord[];
}
