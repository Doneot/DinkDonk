import { describe, expect, it, vi } from "vitest";

import { EventSubValidationError } from "../../../../../modules/twitch/eventsub/EventSubValidationError.js";
import { dispatchEventSubNotification } from "../../../../../modules/twitch/eventsub/EventSubDispatcher.js";
import { createEventSubHandlerRegistry } from "../../../../../modules/twitch/eventsub/EventSubHandlerRegistry.js";

import {
  buildRevocationEvent,
  buildStreamOfflineEvent,
  buildStreamOnlineEvent,
  buildWebhookVerification,
} from "../../../../builders/eventSub.js";

function setup() {
  const onNotification = vi.fn().mockResolvedValue(undefined);

  return {
    onNotification,
    handlers: createEventSubHandlerRegistry(onNotification),
  };
}

function dispatch(
  payload: unknown,
  messageType: string,
  handlers = setup().handlers,
) {
  return dispatchEventSubNotification(
    JSON.stringify(payload),
    messageType,
    handlers,
  );
}

describe("dispatchEventSubNotification", () => {
  describe("webhook_callback_verification", () => {
    it("echoes the challenge", async () => {
      const result = await dispatch(
        buildWebhookVerification("challenge-token"),
        "webhook_callback_verification",
      );

      expect(result).toEqual({ status: 200, challenge: "challenge-token" });
    });

    it("rejects a verification without a challenge", async () => {
      const { challenge: _challenge, ...payload } = buildWebhookVerification();

      await expect(
        dispatch(payload, "webhook_callback_verification"),
      ).rejects.toThrow(EventSubValidationError);
    });

    it("rejects an empty challenge", async () => {
      await expect(
        dispatch(buildWebhookVerification(""), "webhook_callback_verification"),
      ).rejects.toThrow(EventSubValidationError);
    });

    it("never invokes notification handlers", async () => {
      const { handlers, onNotification } = setup();

      await dispatch(
        buildWebhookVerification(),
        "webhook_callback_verification",
        handlers,
      );

      expect(onNotification).not.toHaveBeenCalled();
    });
  });

  describe("notification", () => {
    it("runs the registered handler and acknowledges", async () => {
      const { handlers, onNotification } = setup();
      const payload = buildStreamOnlineEvent();

      const result = await dispatch(payload, "notification", handlers);

      expect(result).toEqual({ status: 204 });
      expect(onNotification.mock.calls).toEqual([
        ["stream.online", payload.event],
      ]);
    });

    it("runs the stream.offline handler with its own (started_at-less) event shape", async () => {
      const { handlers, onNotification } = setup();
      const payload = buildStreamOfflineEvent();

      const result = await dispatch(payload, "notification", handlers);

      expect(result).toEqual({ status: 204 });
      expect(onNotification.mock.calls).toEqual([
        ["stream.offline", payload.event],
      ]);
    });

    it("ignores a subscription type without a handler", async () => {
      const { handlers, onNotification } = setup();
      const payload = {
        ...buildStreamOnlineEvent(),
        subscription: { type: "channel.follow", version: "1" },
      };

      const result = await dispatch(payload, "notification", handlers);

      expect(result).toEqual({ status: 204 });
      expect(onNotification).not.toHaveBeenCalled();
    });

    it("does not resolve an inherited Object.prototype member as a handler", async () => {
      const { handlers, onNotification } = setup();
      const payload = {
        ...buildStreamOnlineEvent(),
        subscription: { type: "constructor", version: "1" },
      };

      const result = await dispatch(payload, "notification", handlers);

      expect(result).toEqual({ status: 204 });
      expect(onNotification).not.toHaveBeenCalled();
    });

    it("rejects an event payload that fails the stream.online schema", async () => {
      const { handlers, onNotification } = setup();
      const payload = {
        ...buildStreamOnlineEvent(),
        event: { broadcaster_user_id: "streamer-1" },
      };

      await expect(
        dispatch(payload, "notification", handlers),
      ).rejects.toThrow(EventSubValidationError);
      expect(onNotification).not.toHaveBeenCalled();
    });

    it("includes the invalid event and the validation issues on the error", async () => {
      const { handlers } = setup();
      const invalidEvent = { broadcaster_user_id: "streamer-1" };
      const payload = { ...buildStreamOnlineEvent(), event: invalidEvent };

      const error = await dispatch(payload, "notification", handlers).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(EventSubValidationError);
      expect((error as EventSubValidationError).details).toMatchObject({
        event: invalidEvent,
      });
      expect((error as EventSubValidationError).details?.issues).toBeDefined();
    });

    it("propagates a handler failure", async () => {
      const handlers = createEventSubHandlerRegistry(
        vi.fn().mockRejectedValue(new Error("notify failed")),
      );

      await expect(
        dispatch(buildStreamOnlineEvent(), "notification", handlers),
      ).rejects.toThrow("notify failed");
    });
  });

  describe("other message types", () => {
    it("acknowledges a revocation without running handlers", async () => {
      const { handlers, onNotification } = setup();

      const result = await dispatch(
        buildRevocationEvent(),
        "revocation",
        handlers,
      );

      expect(result).toEqual({ status: 204 });
      expect(onNotification).not.toHaveBeenCalled();
    });

    it("acknowledges an unknown message type", async () => {
      const result = await dispatch(buildStreamOnlineEvent(), "unknown_type");

      expect(result).toEqual({ status: 204 });
    });
  });

  describe("malformed input", () => {
    it("rejects an envelope without a subscription", async () => {
      await expect(dispatch({ event: {} }, "notification")).rejects.toThrow(
        EventSubValidationError,
      );
    });

    it("includes the raw body and the validation issues on the error", async () => {
      const payload = { event: {} };

      const error = await dispatch(payload, "notification").catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(EventSubValidationError);
      expect((error as EventSubValidationError).details).toMatchObject({
        raw: JSON.stringify(payload),
      });
      expect((error as EventSubValidationError).details?.issues).toBeDefined();
    });

    it("rejects an envelope whose subscription has no type", async () => {
      await expect(
        dispatch({ subscription: { version: "1" }, event: {} }, "notification"),
      ).rejects.toThrow(EventSubValidationError);
    });

    it("rejects a JSON body that is not an object", async () => {
      await expect(
        dispatchEventSubNotification("[]", "notification", setup().handlers),
      ).rejects.toThrow(EventSubValidationError);
    });

    it("throws EventSubValidationError for malformed JSON", async () => {
      await expect(
        dispatchEventSubNotification("{", "notification", setup().handlers),
      ).rejects.toThrow(EventSubValidationError);
    });
  });
});
