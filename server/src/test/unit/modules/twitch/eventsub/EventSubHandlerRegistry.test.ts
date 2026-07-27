import { describe, expect, it, vi } from "vitest";

import { createEventSubHandlerRegistry } from "../../../../../modules/twitch/eventsub/EventSubHandlerRegistry.js";
import type { TwitchEventSubStreamOnlineEvent } from "../../../../../modules/twitch/domain/Twitch.js";

const event: TwitchEventSubStreamOnlineEvent = {
  broadcaster_user_id: "streamer-1",
  broadcaster_user_login: "streamer",
  broadcaster_user_name: "Streamer",
  type: "live",
  started_at: "2024-01-01T12:00:00.000Z",
};

describe("createEventSubHandlerRegistry", () => {
  it("registers a handler for stream.online only", () => {
    const registry = createEventSubHandlerRegistry(vi.fn());

    expect(Object.keys(registry)).toEqual(["stream.online"]);
  });

  it("forwards the event type and payload to the callback", async () => {
    const onNotification = vi.fn().mockResolvedValue(undefined);
    const registry = createEventSubHandlerRegistry(onNotification);

    await registry["stream.online"]?.(event);

    expect(onNotification.mock.calls).toEqual([["stream.online", event]]);
  });

  it("propagates a rejection from the callback", async () => {
    const registry = createEventSubHandlerRegistry(
      vi.fn().mockRejectedValue(new Error("handler failed")),
    );

    await expect(registry["stream.online"]?.(event)).rejects.toThrow(
      "handler failed",
    );
  });
});
