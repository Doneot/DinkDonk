import express from "express";
import type { Router } from "express";
import { createEventSubHandlerRegistry } from "../../modules/twitch/eventsub/EventSubHandlerRegistry.js";
import type { TwitchEventSubStreamOnlineEvent } from "../../modules/twitch/domain/Twitch.js";
import { eventSubHeadersSchema } from "../schemas/eventSub.js";
import { verifyEventSubSignature } from "../../modules/twitch/eventsub/EventSubSignatureVerifier.js";
import { dispatchEventSubNotification } from "../../modules/twitch/eventsub/EventSubDispatcher.js";
import {
  eventSubRequestsTotal,
  eventSubSignatureFailuresTotal,
} from "../../infrastructure/metrics/prometheus.js";
import type { InMemoryReplayStore } from "../../modules/notifications/infrastructure/InMemoryReplayStore.js";
import { eventSubDuplicateMessagesTotal } from "../../infrastructure/metrics/prometheus.js";

type CreateEventSubRouterOptions = {
  secret: string;

  replayStore: InMemoryReplayStore;

  onNotification: (
    type: string,
    event: TwitchEventSubStreamOnlineEvent,
  ) => Promise<void>;
};

export function createEventSubRouter({
  secret,
  replayStore,
  onNotification,
}: CreateEventSubRouterOptions): Router {
  const router = express.Router();

  const handlers = createEventSubHandlerRegistry(onNotification);

  router.post(
    "/eventsub",
    express.raw({ type: "application/json" }),
    async (req, res): Promise<void> => {
      const raw = (req.body as Buffer).toString();

      const headers = eventSubHeadersSchema.safeParse(req.headers);

      if (!headers.success) {
        res.sendStatus(400);
        return;
      }

      const {
        "twitch-eventsub-message-id": messageId,
        "twitch-eventsub-message-signature": signature,
        "twitch-eventsub-message-timestamp": timestamp,
        "twitch-eventsub-message-type": messageType,
      } = headers.data;

      if (
        !verifyEventSubSignature({
          secret,
          messageId,
          timestamp,
          signature,
          body: raw,
        })
      ) {
        eventSubSignatureFailuresTotal.inc();
        res.sendStatus(403);
        return;
      }

      eventSubRequestsTotal.inc();

      if (!(await replayStore.rememberIfNew(messageId))) {
        eventSubDuplicateMessagesTotal.inc();
        res.sendStatus(204);
        return;
      }

      const result = await dispatchEventSubNotification(
        raw,
        messageType,
        handlers,
      );

      switch (result.status) {
        case 200:
          res.type("text/plain").status(200).send(result.challenge);
          return;

        case 204:
          res.sendStatus(204);
          return;

        default:
          res.sendStatus(400);
          return;
      }
    },
  );

  return router;
}
