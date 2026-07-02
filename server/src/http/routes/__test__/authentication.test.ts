import request from "supertest";
import { describe, expect, it } from "vitest";

import { errorResponseSchema } from "../../schemas/responses.js";

import { createTestApp } from "../../../test/helpers/createTestApp.js";

describe("api routes", () => {
  it("rejects unauthenticated API requests", async () => {
    const { app } = createTestApp({ authenticated: false });

    const response = await request(app).get("/api/status").expect(401);
    const responseBody = errorResponseSchema.parse(response.body);

    expect(responseBody).toEqual({
      error: "unauthorized",
      message: "Unauthorized",
    });
  });
});
