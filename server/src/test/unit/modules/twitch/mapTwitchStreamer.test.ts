import { describe, expect, it } from "vitest";

import { mapTwitchStreamer } from "../../../../modules/twitch/infrastructure/mappers/mapTwitchStreamer.js";

const raw = {
  id: "streamer-1",
  login: "streamer",
  display_name: "Streamer",
};

describe("mapTwitchStreamer", () => {
  it("keeps the profile image when present", () => {
    expect(
      mapTwitchStreamer({
        ...raw,
        profile_image_url: "https://example.com/avatar.png",
        thumbnail_url: "https://example.com/thumb.png",
      }),
    ).toEqual({
      ...raw,
      profile_image_url: "https://example.com/avatar.png",
    });
  });

  it("falls back to the search thumbnail", () => {
    expect(
      mapTwitchStreamer({
        ...raw,
        thumbnail_url: "https://example.com/thumb.png",
      }),
    ).toEqual({
      ...raw,
      profile_image_url: "https://example.com/thumb.png",
    });
  });

  it("falls back to an empty string when no image is available", () => {
    expect(mapTwitchStreamer(raw)).toEqual({
      ...raw,
      profile_image_url: "",
    });
  });
});
