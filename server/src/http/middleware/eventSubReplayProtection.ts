import type { RequestHandler } from "express";
import type { ReplayStore } from "../../modules/notifications/ports/ReplayStore.js";

import { eventSubDuplicateMessagesTotal } from "../../infrastructure/metrics/prometheus.js";

const MESSAGE_ID_HEADER = "Twitch-Eventsub-Message-Id";

export function createEventSubReplayProtection(
  replayStore: ReplayStore,
): RequestHandler {
  return async (req, res, next) => {
    const messageId = req.header(MESSAGE_ID_HEADER);

    if (!messageId) {
      res.status(400).send("Missing Twitch-Eventsub-Message-Id");

      return;
    }

    const accepted = await replayStore.rememberIfNew(messageId);

    if (!accepted) {
      // Duplicate delivery; ignore it.
      eventSubDuplicateMessagesTotal.inc();
      res.sendStatus(204);

      return;
    }

    next();
  };
}
