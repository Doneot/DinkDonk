import { afterEach, describe, expect, it, vi } from "vitest";

import type { NotificationManager } from "../../../../modules/notifications/application/NotificationManager.js";
import { StreamNotificationService } from "../../../../modules/notifications/application/StreamNotificationService.js";
import type {
  TwitchEventSubStreamOnlineEvent,
  TwitchStreamer,
} from "../../../../modules/twitch/domain/Twitch.js";

import { buildStreamer } from "../../../builders/streamer.js";
import { buildUser } from "../../../builders/user.js";
import { FakeTwitchStreamers } from "../../../helpers/fakeTwitch.js";
import { InMemoryStreamerRepository } from "../../../repositories/inMemory/InMemoryStreamerRepository.js";
import { InMemoryUserRepository } from "../../../repositories/inMemory/InMemoryUserRepository.js";
import { logger } from "../../../../shared/logger/logger.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const event: TwitchEventSubStreamOnlineEvent = {
  broadcaster_user_id: "streamer-1",
  broadcaster_user_login: "streamer",
  broadcaster_user_name: "Streamer",
  type: "live",
  started_at: "2026-06-29T00:00:00Z",
};

const twitchStreamer: TwitchStreamer = {
  id: "streamer-1",
  login: "streamer",
  display_name: "Streamer",
  profile_image_url: "https://example.com/avatar.png",
};

type SetupOptions = {
  knownStreamers?: TwitchStreamer[];
  streamers?: ReturnType<typeof buildStreamer>[];
  users?: ReturnType<typeof buildUser>[];
  subscriptions?: Array<{
    userId: string;
    streamerId: string;
    message: string;
  }>;
};

function setup({
  knownStreamers = [twitchStreamer],
  streamers = [],
  users = [],
  subscriptions = [],
}: SetupOptions = {}) {
  const twitch = new FakeTwitchStreamers(knownStreamers);
  const userRepository = new InMemoryUserRepository();
  const streamerRepository = new InMemoryStreamerRepository();

  // Subscriptions now live on the User record itself (StreamNotificationService
  // no longer depends on SubscriptionRepository), so merge them into the
  // seeded users before storing.
  const usersById = new Map(
    users.map((user) => [user.id, structuredClone(user)]),
  );

  for (const { userId, streamerId, message } of subscriptions) {
    const user = usersById.get(userId) ?? buildUser({ id: userId });

    user.subscriptions = [
      ...user.subscriptions,
      { id: streamerId, notification_message: message },
    ];

    usersById.set(userId, user);
  }

  for (const user of usersById.values()) {
    userRepository.seed(user);
  }

  for (const streamer of streamers) {
    streamerRepository.seed(streamer);
  }

  const notify = vi.fn<NotificationManager["notify"]>().mockResolvedValue([]);
  const notificationManager = { notify } as unknown as NotificationManager;

  return {
    notify,
    userRepository,
    service: new StreamNotificationService(
      twitch,
      userRepository,
      streamerRepository,
      notificationManager,
    ),
  };
}

describe("StreamNotificationService", () => {
  it("notifies subscribed users with their custom subscription message", async () => {
    const { service, notify } = setup({
      streamers: [buildStreamer({ id: "streamer-1", users: ["user-1"] })],
      users: [buildUser({ id: "user-1" })],
      subscriptions: [
        {
          userId: "user-1",
          streamerId: "streamer-1",
          message: "Custom message",
        },
      ],
    });

    await service.handleStreamOnline(event);

    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ id: "user-1" });
    expect(notify.mock.calls[0]?.[1]).toMatchObject({
      type: "stream.online",
      body: "Custom message",
      streamer: { id: "streamer-1", login: "streamer" },
    });
  });

  it("falls back to the default message when the subscription has none", async () => {
    const { service, notify } = setup({
      streamers: [buildStreamer({ id: "streamer-1", users: ["user-1"] })],
      users: [buildUser({ id: "user-1" })],
      subscriptions: [
        { userId: "user-1", streamerId: "streamer-1", message: "" },
      ],
    });

    await service.handleStreamOnline(event);

    expect(notify.mock.calls[0]?.[1]).toMatchObject({
      body: "Streamer is live!",
    });
  });

  it("falls back to the default message when there is no subscription record", async () => {
    const { service, notify } = setup({
      streamers: [buildStreamer({ id: "streamer-1", users: ["user-1"] })],
      users: [buildUser({ id: "user-1" })],
    });

    await service.handleStreamOnline(event);

    expect(notify.mock.calls[0]?.[1]).toMatchObject({
      body: "Streamer is live!",
    });
  });

  it("notifies every subscriber of the streamer", async () => {
    const { service, notify } = setup({
      streamers: [
        buildStreamer({ id: "streamer-1", users: ["user-1", "user-2"] }),
      ],
      users: [buildUser({ id: "user-1" }), buildUser({ id: "user-2" })],
    });

    await service.handleStreamOnline(event);

    expect(notify.mock.calls.map((call) => call[0].id)).toEqual([
      "user-1",
      "user-2",
    ]);
  });

  it("does not notify when Twitch cannot resolve the streamer", async () => {
    const { service, notify } = setup({ knownStreamers: [] });

    await service.handleStreamOnline(event);

    expect(notify).not.toHaveBeenCalled();
  });

  it("does not notify when the streamer has no record", async () => {
    const { service, notify } = setup();

    await service.handleStreamOnline(event);

    expect(notify).not.toHaveBeenCalled();
  });

  it("does not notify when the streamer has no subscribers", async () => {
    const { service, notify } = setup({
      streamers: [buildStreamer({ id: "streamer-1", users: [] })],
    });

    await service.handleStreamOnline(event);

    expect(notify).not.toHaveBeenCalled();
  });

  it("skips subscribers whose user record has disappeared", async () => {
    const { service, notify } = setup({
      streamers: [
        buildStreamer({ id: "streamer-1", users: ["user-1", "ghost"] }),
      ],
      users: [buildUser({ id: "user-1" })],
    });

    await service.handleStreamOnline(event);

    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ id: "user-1" });
  });

  it("isolates one subscriber's repository failure instead of failing the whole run", async () => {
    const error = vi.spyOn(logger, "error").mockReturnValue();
    const { service, notify, userRepository } = setup({
      streamers: [
        buildStreamer({ id: "streamer-1", users: ["user-1", "user-2"] }),
      ],
      users: [buildUser({ id: "user-1" }), buildUser({ id: "user-2" })],
    });

    vi.spyOn(userRepository, "getUser").mockImplementation((id) =>
      id === "user-1"
        ? Promise.reject(new Error("firestore unavailable"))
        : InMemoryUserRepository.prototype.getUser.call(userRepository, id),
    );

    await expect(service.handleStreamOnline(event)).resolves.toBeUndefined();

    // user-2's notification still goes out despite user-1's lookup failing.
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ id: "user-2" });

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        streamerId: "streamer-1",
        error: expect.any(Error) as Error,
      }),
      "Failed to notify subscriber of stream going live",
    );
  });
});
