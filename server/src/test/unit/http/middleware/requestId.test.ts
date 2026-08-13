import { describe, expect, it } from "vitest";

import { requestId } from "../../../../http/middleware/requestId.js";
import {
  createMockRequest,
  createMockResponse,
  createNext,
} from "../../../helpers/express.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("requestId", () => {
  it("assigns a uuid to the request and echoes it as a header", () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createNext();

    requestId(req, res, next);

    expect(req.requestId).toMatch(UUID_PATTERN);
    expect(res.headers["x-request-id"]).toBe(req.requestId);
    expect(next.calls).toEqual([undefined]);
  });

  it("generates a distinct id per request", () => {
    const first = createMockRequest();
    const second = createMockRequest();

    requestId(first, createMockResponse(), createNext());
    requestId(second, createMockResponse(), createNext());

    expect(first.requestId).not.toBe(second.requestId);
  });
});
