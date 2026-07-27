import { describe, expect, it } from "vitest";

import { buildStreamerLivePayload } from "../../../../modules/notifications/domain/buildStreamerLiveNotification.js";
import type { TwitchStreamer } from "../../../../modules/twitch/domain/Twitch.js";

const streamer: TwitchStreamer = {
  id: "streamer-1",
  login: "streamer",
  display_name: "Streamer",
  profile_image_url: "https://example.com/avatar.png",
};

describe("buildStreamerLivePayload", () => {
  it("builds the default payload for a live streamer", () => {
    expect(buildStreamerLivePayload({ streamer })).toEqual({
      type: "stream.online",
      title: "Streamer is live!",
      body: "Streamer is live!",
      url: "https://www.twitch.tv/streamer",
      streamer: {
        id: "streamer-1",
        login: "streamer",
        displayName: "Streamer",
        avatar: "https://example.com/avatar.png",
      },
    });
  });

  it("substitutes every %s placeholder in a custom message", () => {
    const notification = buildStreamerLivePayload({
      streamer,
      message: "%s is live — go watch %s!",
    });

    expect(notification.body).toBe("Streamer is live — go watch Streamer!");
  });

  it("keeps the title independent of the custom message", () => {
    const notification = buildStreamerLivePayload({
      streamer,
      message: "custom",
    });

    expect(notification.title).toBe("Streamer is live!");
  });

  it.each([
    ["undefined", undefined],
    ["empty", ""],
  ])("falls back to the default body for an %s message", (_label, message) => {
    const notification = buildStreamerLivePayload({
      streamer,
      ...(message === undefined ? {} : { message }),
    });

    expect(notification.body).toBe("Streamer is live!");
  });

  it("defaults the avatar to an empty string when Twitch has none", () => {
    const { profile_image_url: _avatar, ...withoutAvatar } = streamer;

    const notification = buildStreamerLivePayload({ streamer: withoutAvatar });

    expect(notification.streamer?.avatar).toBe("");
  });
});
