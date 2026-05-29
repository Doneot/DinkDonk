export interface DiscordService {
  isReady: boolean;

  canSendDirectMessage(userId: string): Promise<boolean>;
}
