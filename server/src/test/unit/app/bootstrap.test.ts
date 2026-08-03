import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "../../../shared/logger/logger.js";

const runtimeDispose = vi.fn().mockResolvedValue(undefined);
const fakeRuntime = { publicUrl: "http://localhost:3000", dispose: runtimeDispose };

vi.mock("../../../app/runtime/createRuntime.js", () => ({
  createRuntime: vi.fn().mockResolvedValue(fakeRuntime),
}));

const twitchStart = vi.fn().mockResolvedValue(undefined);
const discordStart = vi.fn().mockResolvedValue(undefined);
const redisConnect = vi.fn().mockResolvedValue(undefined);
const garbageCollectSubscriptions = vi.fn().mockResolvedValue(undefined);

const fakeContainer = {
  firestore: {},
  redis: { connect: redisConnect, quit: vi.fn().mockResolvedValue(undefined) },
  twitch: { start: twitchStart, stop: vi.fn().mockResolvedValue(undefined) },
  discord: { start: discordStart, stop: vi.fn().mockResolvedValue(undefined) },
  repositories: {
    users: { watchUsers: vi.fn().mockReturnValue(vi.fn()) },
  },
  services: {
    subscriptionCleanup: { garbageCollectSubscriptions },
  },
};

vi.mock("../../../app/container/index.js", () => ({
  createContainer: vi.fn().mockReturnValue(fakeContainer),
}));

const httpServerListen = vi.fn(
  (_port: number, _host: string, callback: () => void) => callback(),
);
const httpServerOn = vi.fn();

const fakeServer = {
  app: {},
  httpServer: { on: httpServerOn, listen: httpServerListen },
  sockets: { close: vi.fn() },
};

vi.mock("../../../app/server.js", () => ({
  createServer: vi.fn().mockReturnValue(fakeServer),
}));

const broadcasterStart = vi.fn();
const broadcasterStop = vi.fn();

vi.mock("../../../modules/users/application/UserChangeBroadcaster.js", () => ({
  UserChangeBroadcaster: vi.fn().mockImplementation(function () {
    return { start: broadcasterStart, stop: broadcasterStop };
  }),
}));

vi.mock("../../../app/configureEventSubscriptions.js", () => ({
  configureEventSubscriptions: vi.fn(),
}));

const schedulerStart = vi.fn();
const schedulerStop = vi.fn();

vi.mock("../../../app/IntervalScheduler.js", () => ({
  IntervalScheduler: vi.fn().mockImplementation(function () {
    return { start: schedulerStart, stop: schedulerStop };
  }),
}));

vi.mock(
  "../../../modules/auth/infrastructure/firestore/FirestoreSessionRepository.js",
  () => ({
    FirestoreSessionRepository: vi.fn().mockImplementation(function () {
      return { purgeExpiredSessions: vi.fn().mockResolvedValue(0) };
    }),
  }),
);

const shutdown = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../app/shutdown.js", () => ({
  registerShutdownHooks: vi.fn().mockReturnValue({ shutdown }),
}));

const { bootstrap } = await import("../../../app/bootstrap.js");

afterEach(() => {
  vi.clearAllMocks();
  twitchStart.mockResolvedValue(undefined);
  discordStart.mockResolvedValue(undefined);
  redisConnect.mockResolvedValue(undefined);
  httpServerListen.mockImplementation(
    (_port: number, _host: string, callback: () => void) => callback(),
  );
});

describe("bootstrap", () => {
  it("starts listening and both cleanup schedulers once Twitch and Discord are both up", async () => {
    await bootstrap();

    expect(httpServerListen).toHaveBeenCalledOnce();
    // Subscription garbage collection and expired-session cleanup are each
    // their own IntervalScheduler instance - see bootstrap.ts.
    expect(schedulerStart).toHaveBeenCalledTimes(2);
    expect(shutdown).not.toHaveBeenCalled();
  });

  it("tears down via the shutdown handle instead of leaking resources when Twitch fails to start", async () => {
    const error = vi.spyOn(logger, "error").mockReturnValue();

    twitchStart.mockRejectedValue(new Error("twitch unreachable"));

    await bootstrap();

    expect(shutdown).toHaveBeenCalledWith("startup_failure");
    expect(error.mock.calls[0]?.[0]).toMatchObject({
      message: "Failed to start Twitch client",
    });

    // Never reaches the point of accepting traffic or scheduling GC.
    expect(httpServerListen).not.toHaveBeenCalled();
    expect(schedulerStart).not.toHaveBeenCalled();
  });

  it("tears down via the shutdown handle when Discord fails to start", async () => {
    vi.spyOn(logger, "error").mockReturnValue();

    discordStart.mockRejectedValue(new Error("discord unreachable"));

    await bootstrap();

    expect(shutdown).toHaveBeenCalledWith("startup_failure");
    expect(httpServerListen).not.toHaveBeenCalled();
  });

  it("still starts the user-change broadcaster before a later startup failure, so shutdown has something to stop", async () => {
    vi.spyOn(logger, "error").mockReturnValue();

    twitchStart.mockRejectedValue(new Error("twitch unreachable"));

    await bootstrap();

    expect(broadcasterStart).toHaveBeenCalledOnce();
  });

  it("keeps serving traffic when Redis fails to connect at startup, since rate limiting and replay dedup fail open without it", async () => {
    const error = vi.spyOn(logger, "error").mockReturnValue();

    redisConnect.mockRejectedValue(new Error("redis unreachable"));

    await bootstrap();

    expect(shutdown).not.toHaveBeenCalled();
    expect(httpServerListen).toHaveBeenCalledOnce();
    expect(schedulerStart).toHaveBeenCalledTimes(2);

    // The rejection is still surfaced, just not treated as fatal.
    await vi.waitFor(() => {
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) as Error }),
        "Redis failed to connect at startup; rate limiting and EventSub replay dedup will run degraded until it reconnects",
      );
    });
  });

  it("starts up normally when Redis isn't configured at all, without attempting to connect it", async () => {
    vi.spyOn(logger, "info").mockReturnValue();

    // createRedisClient() returns undefined when REDIS_URL is unset - there
    // is no client object here at all, so container.redis is undefined
    // rather than an object with a connect() method to call. Restored in
    // finally so this doesn't leak into other tests via the shared
    // module-level fakeContainer.
    const originalRedis = fakeContainer.redis;

    fakeContainer.redis = undefined as unknown as typeof fakeContainer.redis;

    try {
      await bootstrap();

      expect(redisConnect).not.toHaveBeenCalled();
      expect(shutdown).not.toHaveBeenCalled();
      expect(httpServerListen).toHaveBeenCalledOnce();
    } finally {
      fakeContainer.redis = originalRedis;
    }
  });
});
