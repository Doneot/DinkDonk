import express from "express";
import type { Express } from "express";

import { errorHandler } from "../../http/middleware/errorHandler.js";
import { requestId } from "../../http/middleware/requestId.js";
import { createEventSubRouter } from "../../http/routes/eventSubRoutes.js";
import { InMemoryReplayStore } from "../../modules/notifications/infrastructure/InMemoryReplayStore.js";
import type { TwitchEventSubEvent } from "../../modules/twitch/eventsub/EventSubHandlerRegistry.js";

export const EVENTSUB_SECRET = "twitch-webhook-secret";

export type ReceivedNotification = {
  type: string;
  event: TwitchEventSubEvent;
};

export type EventSubTestContext = {
  app: Express;
  secret: string;
  received: ReceivedNotification[];
  replayStore: InMemoryReplayStore;
};

type CreateEventSubTestAppOptions = {
  secret?: string;
  onNotification?: (type: string, event: TwitchEventSubEvent) => Promise<void>;
};

export function createEventSubTestApp({
  secret = EVENTSUB_SECRET,
  onNotification,
}: CreateEventSubTestAppOptions = {}): EventSubTestContext {
  const received: ReceivedNotification[] = [];

  const replayStore = new InMemoryReplayStore({ ttlMs: 10 * 60_000 });

  const app = express();

  app.use(requestId);

  app.use(
    "/eventsub",

    createEventSubRouter({
      secret,

      replayStore,

      onNotification:
        onNotification ??
        ((type, event) => {
          received.push({ type, event });

          return Promise.resolve();
        }),
    }),
  );

  app.use(errorHandler);

  return { app, secret, received, replayStore };
}
