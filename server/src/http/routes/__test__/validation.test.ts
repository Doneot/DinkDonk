import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { errorResponseSchema } from "../../schemas/responses.js";
import { createTestApp } from "../../../test/helpers/createTestApp.js";

describe("api routes", () => {
  it("returns a validation error before calling route dependencies", async () => {
    const ctx = createTestApp();

    const searchSpy = vi.spyOn(ctx.twitch, "searchStreamers");

    const response = await request(ctx.app)
      .get("/api/streamers/search")
      .query({ query: "" })
      .expect(400);

    const responseBody = errorResponseSchema.parse(response.body);

    expect(searchSpy).not.toHaveBeenCalled();

    expect(responseBody).toMatchObject({
      error: "validation_error",
      message: "Bad Request",
    });
  });
});
