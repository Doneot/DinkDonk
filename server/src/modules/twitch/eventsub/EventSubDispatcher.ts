import { z } from "zod";
import {
  eventSubEnvelopeSchema,
  streamOnlineEventSchema,
} from "../../../http/schemas/eventSub.js";
import { BadRequestError } from "../../../http/errors/BadRequestError.js";
import type { EventSubHandlerRegistry } from "./EventSubHandlerRegistry.js";
import { parseEventSubJson } from "./parseEventSubJson.js";

export async function dispatchEventSubNotification(
  raw: string,
  messageType: string,
  handlers: EventSubHandlerRegistry,
): Promise<{ status: 200; challenge: string } | { status: 204 }> {
  const notificationResult = eventSubEnvelopeSchema.safeParse(
    parseEventSubJson(raw),
  );

  if (!notificationResult.success) {
    throw new BadRequestError("Invalid EventSub payload", {
      issues: z.treeifyError(notificationResult.error),
      raw,
    });
  }

  const notification = notificationResult.data;

  if (messageType === "webhook_callback_verification") {
    if (!notification.challenge) {
      throw new BadRequestError("Missing EventSub challenge");
    }

    return {
      status: 200,
      challenge: notification.challenge,
    };
  }

  if (messageType !== "notification") {
    return { status: 204 };
  }

  const handler = handlers[notification.subscription.type];

  if (!handler) {
    return { status: 204 };
  }

  const eventResult = streamOnlineEventSchema.safeParse(notification.event);

  if (!eventResult.success) {
    throw new BadRequestError("Invalid EventSub event payload", {
      issues: z.treeifyError(eventResult.error),
      event: notification.event,
    });
  }

  await handler(eventResult.data);

  return { status: 204 };
}
