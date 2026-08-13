import { afterEach, describe, expect, it, vi } from "vitest";

import {
  errorResponseSchema,
  streamerSummaryResponseSchema,
  trackedStreamerSummaryResponseSchema,
} from "../../../http/schemas/responses.js";
import { createTestApp } from "../../helpers/createTestApp.js";
import { TestClient } from "../../helpers/TestClient.js";

const TWITCH_RESULT = {
  id: "streamer_1",
  login: "streamer",
  display_name: "Streamer",
  profile_image_url: "https://example.com/avatar.png",
};

async function createClient() {
  const ctx = await createTestApp();

  return { ctx, client: new TestClient(ctx.app, ctx.repositories) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/streamers/search", () => {
  it("returns typed streamer search results from validated query data", async () => {
    const { ctx, client } = await createClient();

    const search = vi.spyOn(ctx.twitch, "searchStreamers");

    const response = await client
      .get("/api/streamers/search")
      .query({ query: "  streamer  " })
      .expect(200);

    expect(search).toHaveBeenCalledWith("streamer");
    expect(streamerSummaryResponseSchema.array().parse(response.body)).toEqual([
      {
        // From createTestContainer.ts's hardcoded searchStreamers fake, not
        // subject to streamerIdSchema (search results are outbound Twitch
        // data, not client-supplied request input).
        id: "streamer-1",
        name: "Streamer",
        avatar: "https://example.com/avatar.png",
      },
    ]);
  });

  it("returns an empty list when Twitch finds nothing", async () => {
    const { ctx, client } = await createClient();

    vi.spyOn(ctx.twitch, "searchStreamers").mockResolvedValue([]);

    const response = await client
      .get("/api/streamers/search")
      .query({ query: "ghost" })
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it("surfaces a Twitch failure as a 500", async () => {
    const { ctx, client } = await createClient();

    vi.spyOn(ctx.twitch, "searchStreamers").mockRejectedValue(
      new Error("twitch unavailable"),
    );

    const response = await client
      .get("/api/streamers/search")
      .query({ query: "streamer" })
      .expect(500);

    expect(errorResponseSchema.parse(response.body)).toEqual({
      error: "internal_server_error",
      message: "Unexpected error",
    });
  });
});

describe("POST /api/streamers/info", () => {
  it("returns the streamers Twitch knows about", async () => {
    const { ctx, client } = await createClient();

    const fetchStreamers = vi
      .spyOn(ctx.twitch, "fetchStreamers")
      .mockResolvedValue([TWITCH_RESULT]);

    const response = await client.post("/api/streamers/info").send({
      ids: ["streamer_1"],
    });

    expect(response.status).toBe(200);
    expect(fetchStreamers).toHaveBeenCalledWith(["streamer_1"]);
    expect(streamerSummaryResponseSchema.array().parse(response.body)).toEqual([
      {
        id: "streamer_1",
        name: "Streamer",
        avatar: "https://example.com/avatar.png",
      },
    ]);
  });

  it("returns Twitch's own live status for a streamer that's currently live", async () => {
    const { ctx, client } = await createClient();

    vi.spyOn(ctx.twitch, "fetchStreamers").mockResolvedValue([TWITCH_RESULT]);
    vi.spyOn(ctx.twitch, "getLiveStreams").mockResolvedValue([
      { user_id: "streamer_1", started_at: "2024-01-01T12:00:00.000Z" },
    ]);

    const response = await client
      .post("/api/streamers/info")
      .send({ ids: ["streamer_1"] })
      .expect(200);

    expect(
      trackedStreamerSummaryResponseSchema.array().parse(response.body),
    ).toEqual([
      {
        id: "streamer_1",
        name: "Streamer",
        avatar: "https://example.com/avatar.png",
        isLive: true,
        liveSince: "2024-01-01T12:00:00.000Z",
      },
    ]);
  });

  it("reconciles a stale cached live status against Twitch's ground truth", async () => {
    // Reproduces a real gap: a streamer already live before this app ever
    // subscribed to their EventSub events (e.g. their first subscriber just
    // signed up) has no stream.online webhook to learn from - our own cache
    // stays "offline" until something asks Twitch directly, which this
    // route now does.
    const { ctx, client } = await createClient();

    await ctx.repositories.streamers.createStreamer("streamer_1");

    vi.spyOn(ctx.twitch, "fetchStreamers").mockResolvedValue([TWITCH_RESULT]);
    vi.spyOn(ctx.twitch, "getLiveStreams").mockResolvedValue([
      { user_id: "streamer_1", started_at: "2024-01-01T12:00:00.000Z" },
    ]);

    await client
      .post("/api/streamers/info")
      .send({ ids: ["streamer_1"] })
      .expect(200);

    await expect(
      ctx.repositories.streamers.getStreamer("streamer_1"),
    ).resolves.toEqual({
      id: "streamer_1",
      isLive: true,
      liveSince: "2024-01-01T12:00:00.000Z",
    });
  });

  it("defaults to offline for a streamer this app has no record of yet", async () => {
    const { ctx, client } = await createClient();

    vi.spyOn(ctx.twitch, "fetchStreamers").mockResolvedValue([TWITCH_RESULT]);

    const response = await client
      .post("/api/streamers/info")
      .send({ ids: ["streamer_1"] })
      .expect(200);

    expect(
      trackedStreamerSummaryResponseSchema.array().parse(response.body),
    ).toEqual([
      {
        id: "streamer_1",
        name: "Streamer",
        avatar: "https://example.com/avatar.png",
        isLive: false,
        liveSince: null,
      },
    ]);
  });

  it("returns 404 when Twitch knows none of the requested ids", async () => {
    const { client } = await createClient();

    const response = await client
      .post("/api/streamers/info")
      .send({ ids: ["ghost"] });

    expect(response.status).toBe(404);
    expect(errorResponseSchema.parse(response.body)).toEqual({
      error: "not_found",
      message: "We couldn't find that streamer.",
    });
  });

  it("surfaces a Twitch failure as a 500", async () => {
    const { ctx, client } = await createClient();

    vi.spyOn(ctx.twitch, "fetchStreamers").mockRejectedValue(
      new Error("twitch unavailable"),
    );

    const response = await client
      .post("/api/streamers/info")
      .send({ ids: ["streamer_1"] });

    expect(response.status).toBe(500);
  });
});
