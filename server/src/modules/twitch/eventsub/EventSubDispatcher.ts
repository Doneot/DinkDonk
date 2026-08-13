import { z } from "zod";

import {
  eventSubEnvelopeSchema,
  eventSubEventSchemasByType,
} from "../../../http/schemas/eventSub.js";
import type { EventSubHandlerRegistry } from "./EventSubHandlerRegistry.js";
import { EventSubValidationError } from "./EventSubValidationError.js";
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
    throw new EventSubValidationError("Invalid EventSub payload", {
      issues: z.treeifyError(notificationResult.error),
      raw,
    });
  }

  const notification = notificationResult.data;

  if (messageType === "webhook_callback_verification") {
    if (!notification.challenge) {
      throw new EventSubValidationError("Missing EventSub challenge");
    }

    return {
      status: 200,
      challenge: notification.challenge,
    };
  }

  if (messageType !== "notification") {
    return { status: 204 };
  }

  // Object.hasOwn (rather than a bare `handlers[type]` lookup) avoids
  // resolving an inherited Object.prototype member - e.g. `type`
  // "constructor" or "__proto__" - as a false-positive handler.
  const handler = Object.hasOwn(handlers, notification.subscription.type)
    ? handlers[notification.subscription.type]
    : undefined;

  if (!handler) {
    return { status: 204 };
  }

  // handlers and eventSubEventSchemasByType are both keyed by the same fixed
  // set of Twitch subscription.type strings, so a schema is guaranteed to
  // exist here once a handler was found above for the same type.
  const schema =
    eventSubEventSchemasByType[
      notification.subscription.type as keyof typeof eventSubEventSchemasByType
    ];

  const eventResult = schema.safeParse(notification.event);

  if (!eventResult.success) {
    throw new EventSubValidationError("Invalid EventSub event payload", {
      issues: z.treeifyError(eventResult.error),
      event: notification.event,
    });
  }

  await handler(eventResult.data);

  return { status: 204 };
}
