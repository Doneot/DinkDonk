import { describe, expect, it, vi } from "vitest";

import type {
  TwitchEventSubStreamOfflineEvent,
  TwitchEventSubStreamOnlineEvent,
} from "../../../../../modules/twitch/domain/Twitch.js";
import { createEventSubHandlerRegistry } from "../../../../../modules/twitch/eventsub/EventSubHandlerRegistry.js";

const onlineEvent: TwitchEventSubStreamOnlineEvent = {
  broadcaster_user_id: "streamer-1",
  broadcaster_user_login: "streamer",
  broadcaster_user_name: "Streamer",
  type: "live",
  started_at: "2024-01-01T12:00:00.000Z",
};

const offlineEvent: TwitchEventSubStreamOfflineEvent = {
  broadcaster_user_id: "streamer-1",
  broadcaster_user_login: "streamer",
  broadcaster_user_name: "Streamer",
};

describe("createEventSubHandlerRegistry", () => {
  it("registers a handler for stream.online and stream.offline", () => {
    const registry = createEventSubHandlerRegistry(vi.fn());

    expect(Object.keys(registry)).toEqual(["stream.online", "stream.offline"]);
  });

  it("forwards the stream.online event type and payload to the callback", async () => {
    const onNotification = vi.fn().mockResolvedValue(undefined);
    const registry = createEventSubHandlerRegistry(onNotification);

    await registry["stream.online"]?.(onlineEvent);

    expect(onNotification.mock.calls).toEqual([["stream.online", onlineEvent]]);
  });

  it("forwards the stream.offline event type and payload to the callback", async () => {
    const onNotification = vi.fn().mockResolvedValue(undefined);
    const registry = createEventSubHandlerRegistry(onNotification);

    await registry["stream.offline"]?.(offlineEvent);

    expect(onNotification.mock.calls).toEqual([
      ["stream.offline", offlineEvent],
    ]);
  });

  it("propagates a rejection from the callback", async () => {
    const registry = createEventSubHandlerRegistry(
      vi.fn().mockRejectedValue(new Error("handler failed")),
    );

    await expect(registry["stream.online"]?.(onlineEvent)).rejects.toThrow(
      "handler failed",
    );
  });
});
