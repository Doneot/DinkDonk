import { EventEmitter } from "node:events";

import { logger } from "../../../shared/logger/logger.js";
import { env } from "../../../shared/config/env.js";

import { TwitchClient } from "../infrastructure/TwitchClient.js";
import { TwitchAuthenticator } from "../infrastructure/TwitchAuthenticator.js";

import { subscriptionsDeletedTotal } from "../../../infrastructure/metrics/prometheus.js";

export type TwitchProviderOptions = {
  client?: TwitchClient;

  authenticator?: TwitchAuthenticator;

  refreshIntervalMs?: number;
};

export class TwitchProvider extends EventEmitter {
  readonly client: TwitchClient;

  private readonly authenticator: TwitchAuthenticator;

  private readonly refreshIntervalMs: number;

  private refreshInterval?: NodeJS.Timeout;

  private tokenRefreshAt = 0;

  constructor({
    client = new TwitchClient(),
    authenticator = new TwitchAuthenticator(),
    refreshIntervalMs = 60_000,
  }: TwitchProviderOptions = {}) {
    super();

    this.client = client;
    this.authenticator = authenticator;
    this.refreshIntervalMs = refreshIntervalMs;
  }

  async start(): Promise<void> {
    await this.refreshAccessToken();

    this.emit("ready");

    this.startRefreshLoop();
  }

  async stop({
    unsubscribeEventSub = false,
  }: {
    unsubscribeEventSub?: boolean;
  } = {}): Promise<void> {
    clearInterval(this.refreshInterval);

    if (unsubscribeEventSub) {
      await this.unsubscribeWebhookSubscriptions();
    }
  }

  private startRefreshLoop(): void {
    clearInterval(this.refreshInterval);

    this.refreshInterval = setInterval(async () => {
      if (Date.now() < this.tokenRefreshAt) {
        return;
      }

      try {
        await this.refreshAccessToken();

        this.emit("tokenRefreshed");
      } catch (error) {
        const err = error as Error;

        logger.error(
          {
            message: err.message,
          },
          "Failed to refresh Twitch token",
        );
      }
    }, this.refreshIntervalMs);
  }

  private async refreshAccessToken(): Promise<void> {
    const { accessToken, expiresIn } =
      await this.authenticator.refreshAccessToken();

    this.client.setAccessToken(accessToken);

    this.tokenRefreshAt = Date.now() + (expiresIn - 300) * 1000;

    logger.info("Twitch token refreshed");
  }

  private async unsubscribeWebhookSubscriptions(): Promise<void> {
    const subscriptions = await this.client.getEventSubSubscriptions();

    const matchingSubscriptions = subscriptions.filter(
      (subscription) =>
        subscription.transport?.callback === `${env.serverUrl}/eventsub`,
    );

    await Promise.all(
      matchingSubscriptions.map((subscription) => {
        subscriptionsDeletedTotal.inc();
        return this.client.unsubscribeFromEvent(subscription.id);
      }),
    );

    logger.info(
      `Removed ${matchingSubscriptions.length} EventSub subscriptions for this callback`,
    );
  }
}
