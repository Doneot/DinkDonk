import crypto from "node:crypto";
import express from "express";
import type { Request, Response, Router } from "express";

type EventSubNotification = {
  subscription: {
    type: string;
  };

  event: Record<string, unknown>;

  challenge?: string;
};

type EventSubRequest = Request & {
  body: Buffer;

  headers: {
    [key: string]: string | string[] | undefined;

    "twitch-eventsub-message-id"?: string;

    "twitch-eventsub-message-timestamp"?: string;

    "twitch-eventsub-message-signature"?: string;

    "twitch-eventsub-message-type"?: string;
  };
};

type CreateEventSubRouterOptions = {
  secret: string;

  onNotification: (
    type: string,
    event: Record<string, unknown>,
  ) => Promise<void>;
};

export function createEventSubRouter({
  secret,
  onNotification,
}: CreateEventSubRouterOptions): Router {
  const router = express.Router();

  router.post(
    "/eventsub",

    express.raw({
      type: "application/json",
    }),

    async (req: EventSubRequest, res: Response): Promise<void> => {
      const signature = req.headers["twitch-eventsub-message-signature"];

      const messageId = req.headers["twitch-eventsub-message-id"];

      const timestamp = req.headers["twitch-eventsub-message-timestamp"];

      const message = `${messageId}${timestamp}${req.body.toString()}`;

      const expected = `sha256=${crypto
        .createHmac("sha256", secret)
        .update(message)
        .digest("hex")}`;

      if (
        !signature ||
        !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
      ) {
        res.sendStatus(403);

        return;
      }

      const notification = JSON.parse(
        req.body.toString(),
      ) as EventSubNotification;

      const messageType = req.headers["twitch-eventsub-message-type"];

      if (messageType === "webhook_callback_verification") {
        res.type("text/plain").status(200).send(notification.challenge);

        return;
      }

      if (messageType === "notification") {
        await onNotification(
          notification.subscription.type,

          notification.event,
        );

        res.sendStatus(204);

        return;
      }

      res.sendStatus(204);
    },
  );

  return router;
}
