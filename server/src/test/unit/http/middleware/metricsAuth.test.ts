import { describe, expect, it } from "vitest";

import { UnauthorizedError } from "../../../../http/errors/UnauthorizedError.js";
import { createMetricsAuth } from "../../../../http/middleware/metricsAuth.js";
import { createMockRequest, createNext } from "../../../helpers/express.js";

const TOKEN = "a-real-metrics-token-1234567890";

describe("createMetricsAuth", () => {
  it("allows a request with the correct bearer token", () => {
    const guard = createMetricsAuth(TOKEN);
    const next = createNext();

    guard(
      createMockRequest({ headers: { authorization: `Bearer ${TOKEN}` } }),
      undefined as never,
      next,
    );

    expect(next.calls).toEqual([undefined]);
  });

  it("rejects a request with no authorization header", () => {
    const guard = createMetricsAuth(TOKEN);

    expect(() =>
      guard(createMockRequest(), undefined as never, createNext()),
    ).toThrow(UnauthorizedError);
  });

  it("rejects a request with the wrong token", () => {
    const guard = createMetricsAuth(TOKEN);

    expect(() =>
      guard(
        createMockRequest({
          headers: { authorization: "Bearer wrong-token-1234567890" },
        }),
        undefined as never,
        createNext(),
      ),
    ).toThrow(UnauthorizedError);
  });

  it("rejects a non-Bearer authorization header", () => {
    const guard = createMetricsAuth(TOKEN);

    expect(() =>
      guard(
        createMockRequest({ headers: { authorization: `Basic ${TOKEN}` } }),
        undefined as never,
        createNext(),
      ),
    ).toThrow(UnauthorizedError);
  });
});
