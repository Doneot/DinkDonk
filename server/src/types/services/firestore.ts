import type { User } from "../user.js";

export interface UserReaderService {
  getUser(userId: string): Promise<User | null>;
}

export interface SubscriptionService {
  subscribe(
    userId: string,
    streamerId: string,
    notificationMessage?: string | null,
  ): Promise<{
    success: boolean;
    reason?: string;
  }>;

  unsubscribe(
    userId: string,
    streamerId: string,
  ): Promise<{
    success: boolean;
    reason?: string;
  }>;
}

export interface MessageService {
  setMessage(
    userId: string,
    streamerId: string,
    message: string,
  ): Promise<{
    success: boolean;
    reason?: string;
  }>;
}
