import express from "express";
import type { Router } from "express";
import { z } from "zod";
import { createEventSubHandlerRegistry } from "../../modules/twitch/eventsub/EventSubHandlerRegistry.js";
import type { TwitchEventSubStreamOnlineEvent } from "../../modules/twitch/domain/Twitch.js";
import { eventSubHeadersSchema } from "../schemas/eventSub.js";
import { verifyEventSubSignature } from "../../modules/twitch/eventsub/EventSubSignatureVerifier.js";
import { dispatchEventSubNotification } from "../../modules/twitch/eventsub/EventSubDispatcher.js";
import { BadRequestError } from "../errors/BadRequestError.js";
import {
  eventSubRequestsTotal,
  eventSubSignatureFailuresTotal,
  eventSubDuplicateMessagesTotal,
} from "../../infrastructure/metrics/prometheus.js";
import type { ReplayStore } from "../../modules/notifications/ports/ReplayStore.js";
import { logger } from "../../shared/logger/logger.js";

type CreateEventSubRouterOptions = {
  secret: string;

  replayStore: ReplayStore;

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
    "/",
    // Explicit (rather than relying on express.raw's 100kb default) so the
    // bound on this public, pre-auth endpoint is self-documenting and a
    // little tighter: real EventSub notification payloads are small JSON
    // bodies, well under this.
    express.raw({ type: "application/json", limit: "64kb" }),
    async (req, res): Promise<void> => {
      const raw = (req.body as Buffer).toString();

      const headers = eventSubHeadersSchema.safeParse(req.headers);

      if (!headers.success) {
        throw new BadRequestError(
          "Invalid EventSub headers",
          z.treeifyError(headers.error),
        );
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
        logger.warn(
          { requestId: req.requestId, ip: req.ip, messageId },
          "Rejected EventSub request with an invalid signature",
        );
        res.sendStatus(403);
        return;
      }

      eventSubRequestsTotal.inc();

      if (!(await replayStore.rememberIfNew(messageId))) {
        eventSubDuplicateMessagesTotal.inc();
        res.sendStatus(204);
        return;
      }

      let result;

      try {
        result = await dispatchEventSubNotification(raw, messageType, handlers);
      } catch (error) {
        // Dispatch failed outright (as opposed to an individual subscriber's
        // notification failing, which StreamNotificationService already
        // isolates per-user): release the reservation so Twitch's retry of
        // this same message id is actually reprocessed instead of being
        // silently treated as an already-handled duplicate.
        await replayStore.forget(messageId);
        throw error;
      }

      switch (result.status) {
        case 200:
          res.type("text/plain").status(200).send(result.challenge);
          return;

        case 204:
          res.sendStatus(204);
          return;
      }
    },
  );

  return router;
}
