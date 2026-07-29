import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Identity,
  Provider,
  SessionUser,
} from "../../../../modules/auth/domain/Identity.js";
import { UnauthorizedError } from "../../../../http/errors/UnauthorizedError.js";
import { env } from "../../../../shared/config/env.js";
import { logger } from "../../../../shared/logger/logger.js";

import { buildIdentity, buildSessionUser } from "../../../builders/auth.js";
import { InMemoryIdentityRepository } from "../../../repositories/inMemory/InMemoryIdentityRepository.js";
import {
  createMockRequest,
  createMockResponse,
  createNext,
} from "../../../helpers/express.js";

import { stringContaining } from "../../../helpers/matchers.js";

type RefreshCallback = (
  error: Error | { statusCode: number; data?: unknown } | null,
  accessToken?: string,
  newRefreshToken?: string,
) => void;

const requestNewAccessToken =
  vi.fn<
    (strategy: string, refreshToken: string, done: RefreshCallback) => void
  >();

vi.mock("passport-oauth2-refresh", () => ({
  default: {
    requestNewAccessToken: (
      strategy: string,
      refreshToken: string,
      done: RefreshCallback,
    ) => requestNewAccessToken(strategy, refreshToken, done),
  },
}));

const { createFreshTokenMiddleware, requireAuthenticated, requireUser } =
  await import("../../../../http/middleware/auth.js");

const STALE_FETCH_TIME = Date.now() - 7 * 24 * 60 * 60 * 1000;

function sessionUserFor(
  identity: Identity,
  providers: Provider[] = ["discord"],
): SessionUser {
  return buildSessionUser({ id: identity.uid, providers });
}

function authenticatedRequest(user: SessionUser) {
  return createMockRequest({ user });
}

function setup(identity: Identity | null = buildIdentity()) {
  const repository = new InMemoryIdentityRepository();

  if (identity) {
    repository.seed(identity);
  }

  return {
    repository,
    middleware: createFreshTokenMiddleware(repository),
  };
}

beforeEach(() => {
  vi.spyOn(logger, "error").mockReturnValue();
  vi.spyOn(logger, "warn").mockReturnValue();
});

afterEach(() => {
  env.isProduction = false;
  vi.restoreAllMocks();
  requestNewAccessToken.mockReset();
});

describe("requireUser", () => {
  it("returns the authenticated user", () => {
    const user = buildSessionUser();

    expect(requireUser(authenticatedRequest(user))).toBe(user);
  });

  it("throws when the request is anonymous", () => {
    expect(() => requireUser(createMockRequest())).toThrow(UnauthorizedError);
  });
});

describe("requireAuthenticated", () => {
  it("continues for an authenticated request", () => {
    const next = createNext();

    requireAuthenticated(
      authenticatedRequest(buildSessionUser()),
      createMockResponse(),
      next,
    );

    expect(next.calls).toEqual([undefined]);
  });

  it("throws for an anonymous request", () => {
    const next = createNext();

    expect(() =>
      requireAuthenticated(createMockRequest(), createMockResponse(), next),
    ).toThrow(UnauthorizedError);

    expect(next.calls).toHaveLength(0);
  });
});

describe("createFreshTokenMiddleware", () => {
  it("continues when the stored token is still fresh", async () => {
    const identity = buildIdentity({
      discord: { ...buildIdentity().discord!, fetchTime: Date.now() },
    });
    const { middleware } = setup(identity);
    const next = createNext();
    const res = createMockResponse();

    await middleware(authenticatedRequest(sessionUserFor(identity)), res, next);

    expect(next.calls).toEqual([undefined]);
    expect(requestNewAccessToken).not.toHaveBeenCalled();
  });

  it("skips entirely for a session with no linked Discord provider", async () => {
    const { repository, middleware } = setup(null);
    const getIdentity = vi.spyOn(repository, "getIdentity");
    const next = createNext();

    const user = buildSessionUser({ id: "google-only-user", providers: [] });

    await middleware(authenticatedRequest(user), createMockResponse(), next);

    expect(next.calls).toEqual([undefined]);
    expect(getIdentity).not.toHaveBeenCalled();
  });

  it("continues without refreshing when the identity record is missing", async () => {
    const { middleware } = setup(null);
    const next = createNext();

    await middleware(
      authenticatedRequest(buildSessionUser({ id: "ghost" })),
      createMockResponse(),
      next,
    );

    expect(next.calls).toEqual([undefined]);
    expect(requestNewAccessToken).not.toHaveBeenCalled();
  });

  it("continues when the session claims Discord but the identity has none linked", async () => {
    const identity = buildIdentity({ discord: undefined });
    const { middleware } = setup(identity);
    const next = createNext();

    await middleware(
      authenticatedRequest(sessionUserFor(identity)),
      createMockResponse(),
      next,
    );

    expect(next.calls).toEqual([undefined]);
    expect(requestNewAccessToken).not.toHaveBeenCalled();
  });

  it("treats a credential that has never been refreshed as stale", async () => {
    const base = buildIdentity();
    const identity = buildIdentity({
      discord: { ...base.discord!, fetchTime: 0 },
    });
    const { middleware } = setup(identity);

    requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
      done(null, "new-access-token", "new-refresh-token");
    });

    await middleware(
      authenticatedRequest(sessionUserFor(identity)),
      createMockResponse(),
      createNext(),
    );

    expect(requestNewAccessToken).toHaveBeenCalledOnce();
  });

  it("refreshes a stale token and persists the new credentials", async () => {
    const base = buildIdentity();
    const identity = buildIdentity({
      discord: { ...base.discord!, fetchTime: STALE_FETCH_TIME },
    });
    const { middleware, repository } = setup(identity);
    const next = createNext();

    requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
      done(null, "new-access-token", "new-refresh-token");
    });

    await middleware(
      authenticatedRequest(sessionUserFor(identity)),
      createMockResponse(),
      next,
    );

    expect(requestNewAccessToken.mock.calls[0]?.[0]).toBe("discord");
    expect(requestNewAccessToken.mock.calls[0]?.[1]).toBe("refresh-token");
    expect(next.calls).toEqual([undefined]);

    const stored = await repository.getIdentity(identity.uid);

    expect(stored?.discord).toMatchObject({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    });
    expect(stored?.discord?.fetchTime).toBeGreaterThan(STALE_FETCH_TIME);
  });

  it("keeps the existing refresh token when Discord omits a new one", async () => {
    const base = buildIdentity();
    const identity = buildIdentity({
      discord: { ...base.discord!, fetchTime: STALE_FETCH_TIME },
    });
    const { middleware, repository } = setup(identity);

    requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
      done(null, "new-access-token", undefined);
    });

    await middleware(
      authenticatedRequest(sessionUserFor(identity)),
      createMockResponse(),
      createNext(),
    );

    const stored = await repository.getIdentity(identity.uid);

    expect(stored?.discord).toMatchObject({
      accessToken: "new-access-token",
      refreshToken: "refresh-token",
    });
  });

  it("refreshes once for concurrent requests from the same user", async () => {
    const base = buildIdentity();
    const identity = buildIdentity({
      discord: { ...base.discord!, fetchTime: STALE_FETCH_TIME },
    });
    const { middleware } = setup(identity);

    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
        release = () => done(null, "new-access-token", "new-refresh-token");
        resolve();
      });
    });

    const firstNext = createNext();
    const secondNext = createNext();
    const user = authenticatedRequest(sessionUserFor(identity));

    const first = middleware(user, createMockResponse(), firstNext);
    const second = middleware(user, createMockResponse(), secondNext);

    await pending;
    release?.();

    await Promise.all([first, second]);

    expect(requestNewAccessToken).toHaveBeenCalledOnce();
    expect(firstNext.calls).toEqual([undefined]);
    expect(secondNext.calls).toEqual([undefined]);
  });

  it("does not refresh again once the stored token is fresh", async () => {
    const base = buildIdentity();
    const identity = buildIdentity({
      discord: { ...base.discord!, fetchTime: STALE_FETCH_TIME },
    });
    const { middleware } = setup(identity);
    const user = authenticatedRequest(sessionUserFor(identity));

    requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
      done(null, "new-access-token", "new-refresh-token");
    });

    await middleware(user, createMockResponse(), createNext());
    await middleware(user, createMockResponse(), createNext());

    expect(requestNewAccessToken).toHaveBeenCalledOnce();
  });

  it("logs a warning and continues (no logout) when the refresh fails", async () => {
    const base = buildIdentity();
    const identity = buildIdentity({
      discord: { ...base.discord!, fetchTime: STALE_FETCH_TIME },
    });
    const { middleware } = setup(identity);
    const req = authenticatedRequest(sessionUserFor(identity));
    const res = createMockResponse();
    const next = createNext();
    const warn = vi.spyOn(logger, "warn").mockReturnValue();

    requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
      done(new Error("invalid_grant"));
    });

    await middleware(req, res, next);

    expect(req.logoutCalls).toBe(0);
    expect(res.redirectedTo).toBeUndefined();
    expect(next.calls).toEqual([undefined]);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: identity.uid,
        error: expect.any(Error) as Error,
      }),
      "Discord token refresh failed; continuing without it",
    );
  });

  it("wraps a non-Error refresh failure and still continues", async () => {
    const base = buildIdentity();
    const identity = buildIdentity({
      discord: { ...base.discord!, fetchTime: STALE_FETCH_TIME },
    });
    const { middleware } = setup(identity);
    const warn = vi.spyOn(logger, "warn").mockReturnValue();
    const next = createNext();

    requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
      done({ statusCode: 401, data: "invalid_grant" });
    });

    await middleware(
      authenticatedRequest(sessionUserFor(identity)),
      createMockResponse(),
      next,
    );

    expect(next.calls).toEqual([undefined]);
    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      userId: identity.uid,
      error: expect.objectContaining({
        message: stringContaining("Discord refresh error"),
      }) as Error,
    });
  });

  it("continues when Discord returns no access token", async () => {
    const base = buildIdentity();
    const identity = buildIdentity({
      discord: { ...base.discord!, fetchTime: STALE_FETCH_TIME },
    });
    const { middleware } = setup(identity);
    const res = createMockResponse();
    const warn = vi.spyOn(logger, "warn").mockReturnValue();
    const next = createNext();

    requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
      done(null, undefined);
    });

    await middleware(authenticatedRequest(sessionUserFor(identity)), res, next);

    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      error: expect.objectContaining({
        message: "Missing access token from Discord refresh response",
      }) as Error,
    });
    expect(next.calls).toEqual([undefined]);
  });

  it("rejects an anonymous request before touching the repository", async () => {
    const { middleware } = setup();

    await expect(
      middleware(createMockRequest(), createMockResponse(), createNext()),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("logs an error and continues when the repository lookup throws", async () => {
    const identity = buildIdentity();
    const { middleware, repository } = setup(identity);
    const req = authenticatedRequest(sessionUserFor(identity));
    const res = createMockResponse();
    const error = vi.spyOn(logger, "error").mockReturnValue();
    const next = createNext();

    vi.spyOn(repository, "getIdentity").mockRejectedValue(
      new Error("firestore unavailable"),
    );

    await middleware(req, res, next);

    expect(req.logoutCalls).toBe(0);
    expect(next.calls).toEqual([undefined]);
    expect(error.mock.calls[0]?.[0]).toMatchObject({
      userId: identity.uid,
      error: expect.any(Error) as Error,
    });
  });
});
