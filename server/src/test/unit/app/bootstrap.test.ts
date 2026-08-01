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

vi.mock("../../../app/SubscriptionCleanupScheduler.js", () => ({
  SubscriptionCleanupScheduler: vi.fn().mockImplementation(function () {
    return { start: schedulerStart, stop: schedulerStop };
  }),
}));

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
  it("starts listening and the cleanup scheduler once Twitch and Discord are both up", async () => {
    await bootstrap();

    expect(httpServerListen).toHaveBeenCalledOnce();
    expect(schedulerStart).toHaveBeenCalledOnce();
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
});
