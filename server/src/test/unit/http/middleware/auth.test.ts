import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthUser } from "../../../../modules/auth/domain/AuthUser.js";
import { UnauthorizedError } from "../../../../http/errors/UnauthorizedError.js";
import { env } from "../../../../shared/config/env.js";
import { logger } from "../../../../shared/logger/logger.js";

import { buildAuthUser } from "../../../builders/auth.js";
import { InMemoryAuthUserRepository } from "../../../repositories/inMemory/InMemoryAuthUserRepository.js";
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

function authenticatedRequest(user: AuthUser) {
  return createMockRequest({ user: user });
}

function setup(user: AuthUser | null = buildAuthUser()) {
  const repository = new InMemoryAuthUserRepository();

  if (user) {
    repository.seed(user);
  }

  return {
    repository,
    middleware: createFreshTokenMiddleware(repository),
  };
}

beforeEach(() => {
  vi.spyOn(logger, "error").mockReturnValue();
});

afterEach(() => {
  env.isProduction = false;
  vi.restoreAllMocks();
  requestNewAccessToken.mockReset();
});

describe("requireUser", () => {
  it("returns the authenticated user", () => {
    const user = buildAuthUser();

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
      authenticatedRequest(buildAuthUser()),
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
    const user = buildAuthUser({ fetchTime: Date.now() });
    const { middleware } = setup(user);
    const next = createNext();
    const res = createMockResponse();

    await middleware(authenticatedRequest(user), res, next);

    expect(next.calls).toEqual([undefined]);
    expect(requestNewAccessToken).not.toHaveBeenCalled();
    expect(res.redirectedTo).toBeUndefined();
  });

  it("redirects to Discord login when the user is unknown", async () => {
    const { middleware } = setup(null);
    const next = createNext();
    const res = createMockResponse();

    await middleware(authenticatedRequest(buildAuthUser()), res, next);

    expect(res.redirectedTo).toBe("/api/auth/discord");
    expect(next.calls).toHaveLength(0);
  });

  it.each([
    ["access token", { accessToken: "" }],
    ["refresh token", { refreshToken: "" }],
  ])("redirects to Discord login when the %s is missing", async (_, patch) => {
    const user = buildAuthUser({ fetchTime: Date.now(), ...patch });
    const { middleware } = setup(user);
    const res = createMockResponse();

    await middleware(authenticatedRequest(user), res, createNext());

    expect(res.redirectedTo).toBe("/api/auth/discord");
  });

  it("treats a user that has never been refreshed as stale", async () => {
    const user = buildAuthUser({ fetchTime: 0 });
    const { middleware } = setup(user);

    requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
      done(null, "new-access-token", "new-refresh-token");
    });

    await middleware(
      authenticatedRequest(user),
      createMockResponse(),
      createNext(),
    );

    expect(requestNewAccessToken).toHaveBeenCalledOnce();
  });

  it("refreshes a stale token and persists the new credentials", async () => {
    const user = buildAuthUser({ fetchTime: STALE_FETCH_TIME });
    const { middleware, repository } = setup(user);
    const next = createNext();

    requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
      done(null, "new-access-token", "new-refresh-token");
    });

    await middleware(authenticatedRequest(user), createMockResponse(), next);

    expect(requestNewAccessToken.mock.calls[0]?.[0]).toBe("discord");
    expect(requestNewAccessToken.mock.calls[0]?.[1]).toBe("refresh-token");
    expect(next.calls).toEqual([undefined]);

    const stored = await repository.getAuthUser(user.id);

    expect(stored).toMatchObject({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    });
    expect(stored?.fetchTime).toBeGreaterThan(STALE_FETCH_TIME);
  });

  it("keeps the existing refresh token when Discord omits a new one", async () => {
    const user = buildAuthUser({ fetchTime: STALE_FETCH_TIME });
    const { middleware, repository } = setup(user);

    requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
      done(null, "new-access-token", undefined);
    });

    await middleware(
      authenticatedRequest(user),
      createMockResponse(),
      createNext(),
    );

    expect(await repository.getAuthUser(user.id)).toMatchObject({
      accessToken: "new-access-token",
      refreshToken: "refresh-token",
    });
  });

  it("refreshes once for concurrent requests from the same user", async () => {
    const user = buildAuthUser({ fetchTime: STALE_FETCH_TIME });
    const { middleware } = setup(user);

    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
        release = () => done(null, "new-access-token", "new-refresh-token");
        resolve();
      });
    });

    const firstNext = createNext();
    const secondNext = createNext();

    const first = middleware(
      authenticatedRequest(user),
      createMockResponse(),
      firstNext,
    );
    const second = middleware(
      authenticatedRequest(user),
      createMockResponse(),
      secondNext,
    );

    await pending;
    release?.();

    await Promise.all([first, second]);

    expect(requestNewAccessToken).toHaveBeenCalledOnce();
    expect(firstNext.calls).toEqual([undefined]);
    expect(secondNext.calls).toEqual([undefined]);
  });

  it("does not refresh again once the stored token is fresh", async () => {
    const user = buildAuthUser({ fetchTime: STALE_FETCH_TIME });
    const { middleware } = setup(user);

    requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
      done(null, "new-access-token", "new-refresh-token");
    });

    await middleware(
      authenticatedRequest(user),
      createMockResponse(),
      createNext(),
    );
    await middleware(
      authenticatedRequest(user),
      createMockResponse(),
      createNext(),
    );

    expect(requestNewAccessToken).toHaveBeenCalledOnce();
  });

  it("logs the user out and redirects when the refresh fails", async () => {
    const user = buildAuthUser({ fetchTime: STALE_FETCH_TIME });
    const { middleware } = setup(user);
    const req = authenticatedRequest(user);
    const res = createMockResponse();
    const next = createNext();

    requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
      done(new Error("invalid_grant"));
    });

    await middleware(req, res, next);

    expect(req.logoutCalls).toBe(1);
    expect(req.sessionDestroyCalls).toBe(1);
    expect(res.clearedCookies).toEqual(["connect.sid"]);
    expect(res.redirectedTo).toBe("http://localhost:5000");
    expect(next.calls).toHaveLength(0);
  });

  it("redirects to the server url in production", async () => {
    const user = buildAuthUser({ fetchTime: STALE_FETCH_TIME });
    const { middleware } = setup(user);
    const res = createMockResponse();

    env.isProduction = true;

    requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
      done(new Error("invalid_grant"));
    });

    await middleware(authenticatedRequest(user), res, createNext());

    expect(res.redirectedTo).toBe(env.serverUrl);
  });

  it("wraps a non-Error refresh failure", async () => {
    const user = buildAuthUser({ fetchTime: STALE_FETCH_TIME });
    const { middleware } = setup(user);
    const error = vi.spyOn(logger, "error").mockReturnValue();

    requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
      done({ statusCode: 401, data: "invalid_grant" });
    });

    await middleware(
      authenticatedRequest(user),
      createMockResponse(),
      createNext(),
    );

    expect(error.mock.calls[0]?.[0]).toMatchObject({
      userId: user.id,
      message: stringContaining("Discord refresh error"),
    });
  });

  it("fails when Discord returns no access token", async () => {
    const user = buildAuthUser({ fetchTime: STALE_FETCH_TIME });
    const { middleware } = setup(user);
    const res = createMockResponse();
    const error = vi.spyOn(logger, "error").mockReturnValue();

    requestNewAccessToken.mockImplementation((_strategy, _token, done) => {
      done(null, undefined);
    });

    await middleware(authenticatedRequest(user), res, createNext());

    expect(error.mock.calls[0]?.[0]).toMatchObject({
      message: "Missing access token from Discord refresh response",
    });
    expect(res.redirectedTo).toBe("http://localhost:5000");
  });

  it("rejects an anonymous request before touching the repository", async () => {
    const { middleware } = setup();

    await expect(
      middleware(createMockRequest(), createMockResponse(), createNext()),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("logs out when the repository lookup throws", async () => {
    const user = buildAuthUser();
    const { middleware, repository } = setup(user);
    const req = authenticatedRequest(user);
    const res = createMockResponse();

    vi.spyOn(repository, "getAuthUser").mockRejectedValue(
      new Error("firestore unavailable"),
    );

    await middleware(req, res, createNext());

    expect(req.logoutCalls).toBe(1);
    expect(res.redirectedTo).toBe("http://localhost:5000");
  });
});
