import { describe, expect, it, vi } from "vitest";

import { streamerSummaryResponseSchema } from "../../../../http/schemas/responses.js";
import { createTestApp } from "../../../helpers/createTestApp.js";
import { TestClient } from "../../../helpers/TestClient.js";

describe("api routes", () => {
  it("returns typed streamer search results from validated query data", async () => {
    const ctx = await createTestApp();

    const searchSpy = vi.spyOn(ctx.twitch, "searchStreamers");

    const client = new TestClient(ctx.app, ctx.repositories);

    const response = await client
      .get("/api/streamers/search")
      .query({ query: "  streamer  " })
      .expect(200);

    const responseBody = streamerSummaryResponseSchema
      .array()
      .parse(response.body);

    expect(searchSpy).toHaveBeenCalledWith("streamer");

    expect(responseBody).toEqual([
      {
        id: "streamer-1",
        name: "Streamer",
        avatar: "https://example.com/avatar.png",
      },
    ]);
  });
});
