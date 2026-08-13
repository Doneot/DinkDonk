import type { Redis } from "ioredis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "../../../../http/errors/UnauthorizedError.js";
import type {
  Identity,
  Provider,
  SessionUser,
} from "../../../../modules/auth/domain/Identity.js";
import { env } from "../../../../shared/config/env.js";
import { logger } from "../../../../shared/logger/logger.js";
import { buildIdentity, buildSessionUser } from "../../../builders/auth.js";
import {
  createMockRequest,
  createMockResponse,
  createNext,
} from "../../../helpers/express.js";
import { stringContaining } from "../../../helpers/matchers.js";
import { InMemoryIdentityRepository } from "../../../repositories/inMemory/InMemoryIdentityRepository.js";

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

function setup(identity: Identity | null = buildIdentity(), redis?: Redis) {
  const repository = new InMemoryIdentityRepository();

  if (identity) {
    repository.seed(identity);
  }

  return {
    repository,
    middleware: createFreshTokenMiddleware(repository, redis),
  };
}

/**
 * Backs a distributed refresh lock the same way a real Redis instance would
 * for SET ... NX/DEL: a plain Map keyed by lock name, with "NX" honored (a
 * second SET for an already-held key is refused).
 */
function fakeRedis() {
  const held = new Map<string, unknown>();

  const set = vi.fn(
    (
      key: string,
      value: unknown,
      _px: "PX",
      _ttlMs: number,
      nx: "NX",
    ): Promise<"OK" | null> => {
      if (nx === "NX" && held.has(key)) {
        return Promise.resolve(null);
      }

      held.set(key, value);

      return Promise.resolve("OK");
    },
  );

  const del = vi.fn((key: string): Promise<number> => {
    const existed = held.delete(key);

    return Promise.resolve(existed ? 1 : 0);
  });

  return { redis: { set, del } as unknown as Redis, set, del };
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

  it("refreshes once across two middleware instances sharing a distributed lock", async () => {
    // Simulates two backend instances (two separate createFreshTokenMiddleware
    // closures, each with their own in-process `locks` Map) racing to refresh
    // the same user's token, coordinated only through the shared Redis lock.
    const base = buildIdentity();
    const identity = buildIdentity({
      discord: { ...base.discord!, fetchTime: STALE_FETCH_TIME },
    });
    const repository = new InMemoryIdentityRepository();

    repository.seed(identity);

    const { redis, set, del } = fakeRedis();
    const middlewareA = createFreshTokenMiddleware(repository, redis);
    const middlewareB = createFreshTokenMiddleware(repository, redis);

    requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
      done(null, "new-access-token", "new-refresh-token");
    });

    const user = authenticatedRequest(sessionUserFor(identity));

    await Promise.all([
      middlewareA(user, createMockResponse(), createNext()),
      middlewareB(user, createMockResponse(), createNext()),
    ]);

    expect(requestNewAccessToken).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith(
      `lock:discord-token-refresh:${identity.uid}`,
      "1",
      "PX",
      30_000,
      "NX",
    );
    expect(del).toHaveBeenCalledWith(
      `lock:discord-token-refresh:${identity.uid}`,
    );
  });

  it("proceeds without refreshing when the distributed lock is already held by another instance", async () => {
    const base = buildIdentity();
    const identity = buildIdentity({
      discord: { ...base.discord!, fetchTime: STALE_FETCH_TIME },
    });
    const { redis, set } = fakeRedis();

    // Simulate another instance already holding the lock.
    await set(
      `lock:discord-token-refresh:${identity.uid}`,
      "1",
      "PX",
      30_000,
      "NX",
    );

    const { middleware } = setup(identity, redis);
    const user = authenticatedRequest(sessionUserFor(identity));
    const next = createNext();

    await middleware(user, createMockResponse(), next);

    expect(requestNewAccessToken).not.toHaveBeenCalled();
    expect(next.calls).toEqual([undefined]);
  });

  it("proceeds with the refresh when no Redis client is configured", async () => {
    const base = buildIdentity();
    const identity = buildIdentity({
      discord: { ...base.discord!, fetchTime: STALE_FETCH_TIME },
    });
    const { middleware } = setup(identity);

    requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
      done(null, "new-access-token", "new-refresh-token");
    });

    const user = authenticatedRequest(sessionUserFor(identity));

    await middleware(user, createMockResponse(), createNext());

    expect(requestNewAccessToken).toHaveBeenCalledOnce();
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
