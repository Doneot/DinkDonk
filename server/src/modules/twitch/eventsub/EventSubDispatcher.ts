import {
  eventSubEnvelopeSchema,
  streamOnlineEventSchema,
} from "../../../http/schemas/eventSub.js";
import type { EventSubHandlerRegistry } from "./EventSubHandlerRegistry.js";
import { parseEventSubJson } from "./parseEventSubJson.js";

export async function dispatchEventSubNotification(
  raw: string,
  messageType: string,
  handlers: EventSubHandlerRegistry,
): Promise<
  { status: 400 } | { status: 200; challenge: string } | { status: 204 }
> {
  const notificationResult = eventSubEnvelopeSchema.safeParse(
    parseEventSubJson(raw),
  );

  if (!notificationResult.success) {
    return { status: 400 };
  }

  const notification = notificationResult.data;

  if (messageType === "webhook_callback_verification") {
    if (!notification.challenge) {
      return { status: 400 };
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
    return { status: 400 };
  }

  await handler(eventResult.data);

  return { status: 204 };
}
