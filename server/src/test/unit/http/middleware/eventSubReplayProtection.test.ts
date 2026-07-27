import type { NextFunction, Request, Response } from "express";
import { describe, expect, it } from "vitest";

import { createEventSubReplayProtection } from "../../../../http/middleware/eventSubReplayProtection.js";
import { InMemoryReplayStore } from "../../../../modules/notifications/infrastructure/InMemoryReplayStore.js";

import {
  createMockRequest,
  createMockResponse,
  createNext,
} from "../../../helpers/express.js";

/** The factory is declared as a RequestHandler, but the handler is async. */
type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

function setup() {
  const replayStore = new InMemoryReplayStore({ ttlMs: 60_000 });
  const middleware = createEventSubReplayProtection(
    replayStore,
  ) as unknown as AsyncRequestHandler;

  return { replayStore, middleware };
}

function requestWithMessageId(messageId: string) {
  return createMockRequest({
    headers: { "twitch-eventsub-message-id": messageId },
  });
}

describe("createEventSubReplayProtection", () => {
  it("accepts a message id seen for the first time", async () => {
    const { middleware } = setup();
    const next = createNext();
    const res = createMockResponse();

    await middleware(requestWithMessageId("message-1"), res, next);

    expect(next.calls).toEqual([undefined]);
    expect(res.sentStatus).toBeUndefined();
  });

  it("swallows a duplicate delivery with 204", async () => {
    const { middleware } = setup();
    const next = createNext();

    await middleware(
      requestWithMessageId("message-1"),
      createMockResponse(),
      createNext(),
    );

    const res = createMockResponse();

    await middleware(requestWithMessageId("message-1"), res, next);

    expect(res.sentStatus).toBe(204);
    expect(next.calls).toHaveLength(0);
  });

  it("rejects a request without a message id", async () => {
    const { middleware } = setup();
    const next = createNext();
    const res = createMockResponse();

    await middleware(createMockRequest(), res, next);

    expect(res.statusCode).toBe(400);
    expect(res.sentBody).toBe("Missing Twitch-Eventsub-Message-Id");
    expect(next.calls).toHaveLength(0);
  });

  it("treats distinct message ids independently", async () => {
    const { middleware } = setup();
    const next = createNext();

    await middleware(
      requestWithMessageId("message-1"),
      createMockResponse(),
      createNext(),
    );
    await middleware(
      requestWithMessageId("message-2"),
      createMockResponse(),
      next,
    );

    expect(next.calls).toEqual([undefined]);
  });
});
