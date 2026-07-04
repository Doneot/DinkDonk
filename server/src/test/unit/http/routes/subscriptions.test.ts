import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createTestApp } from "../../../helpers/createTestApp.js";

describe("api routes", () => {
  it("passes validated subscription bodies to repositories", async () => {
    const ctx = await createTestApp();

    const subscribeSpy = vi.spyOn(ctx.repositories.subscriptions, "subscribe");

    await request(ctx.app)
      .post("/api/subscriptions")
      .send({ streamerId: "streamer-1" })
      .expect(200, {
        success: true,
        createdStreamer: false,
      });

    expect(subscribeSpy).toHaveBeenCalledWith("user-1", "streamer-1", "");
  });
});
