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

  // Subscriptions live on the User record itself, so merge them into the
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
    streamerRepository,
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

  it("isolates one subscriber's notification-send failure instead of failing the whole run", async () => {
    const error = vi.spyOn(logger, "error").mockReturnValue();
    const { service, notify } = setup({
      streamers: [
        buildStreamer({ id: "streamer-1", users: ["user-1", "user-2"] }),
      ],
      users: [buildUser({ id: "user-1" }), buildUser({ id: "user-2" })],
    });

    notify.mockImplementation((user) =>
      user.id === "user-1"
        ? Promise.reject(new Error("discord unavailable"))
        : Promise.resolve([]),
    );

    await expect(service.handleStreamOnline(event)).resolves.toBeUndefined();

    // user-2's notification still goes out despite user-1's send failing.
    expect(notify).toHaveBeenCalledTimes(2);

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        streamerId: "streamer-1",
        error: expect.any(Error) as Error,
      }),
      "Failed to notify subscriber of stream going live",
    );
  });

  it("isolates one batch's repository failure from other batches' delivery", async () => {
    const error = vi.spyOn(logger, "error").mockReturnValue();

    // NOTIFY_BATCH_SIZE is 25 - 26 subscribers spans exactly two batches.
    const subscriberIds = Array.from({ length: 26 }, (_, i) => `user-${i}`);

    const { service, notify, userRepository } = setup({
      streamers: [buildStreamer({ id: "streamer-1", users: subscriberIds })],
      users: subscriberIds.map((id) => buildUser({ id })),
    });

    vi.spyOn(userRepository, "getUsersByIds").mockImplementation((ids) =>
      ids.includes("user-0")
        ? Promise.reject(new Error("firestore unavailable"))
        : InMemoryUserRepository.prototype.getUsersByIds.call(
            userRepository,
            ids,
          ),
    );

    await expect(service.handleStreamOnline(event)).resolves.toBeUndefined();

    // The second batch (containing user-25) is still notified despite the
    // first batch's read failing outright.
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ id: "user-25" });

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: expect.arrayContaining(["user-0"]) as string[],
        streamerId: "streamer-1",
        error: expect.any(Error) as Error,
      }),
      "Failed to load a batch of subscribers to notify of stream going live",
    );
  });

  it("notifies only once when two deliveries for the same stream session race concurrently", async () => {
    vi.spyOn(logger, "info").mockReturnValue();

    const { service, notify } = setup({
      streamers: [buildStreamer({ id: "streamer-1", users: ["user-1"] })],
      users: [buildUser({ id: "user-1" })],
    });

    // Two genuinely concurrent deliveries of the same stream session -
    // distinct Twitch message ids (not modeled here; ReplayStore's dedup is
    // by message id and wouldn't catch this), started well within the flap
    // window. Without claiming the dedup map synchronously before the
    // subscriber-list fetch, both calls could pass isDuplicateStreamSession
    // before either claims it.
    await Promise.all([
      service.handleStreamOnline(event),
      service.handleStreamOnline(event),
    ]);

    expect(notify).toHaveBeenCalledOnce();
  });

  it("still notifies on a retry after getSubscriberIds itself fails, instead of treating the retry as a duplicate", async () => {
    const { service, notify, streamerRepository } = setup({
      streamers: [buildStreamer({ id: "streamer-1", users: ["user-1"] })],
      users: [buildUser({ id: "user-1" })],
    });

    vi.spyOn(streamerRepository, "getSubscriberIds").mockRejectedValueOnce(
      new Error("firestore unavailable"),
    );

    // The first delivery attempt fails outright while fetching the
    // subscriber list itself (as opposed to a per-batch user-lookup failure,
    // which is already isolated) - this is what propagates up to
    // eventSubRoutes.ts's catch block in production, which releases the
    // replay-store's message-id reservation so Twitch's retry is reprocessed
    // rather than treated as an already-handled duplicate.
    await expect(service.handleStreamOnline(event)).rejects.toThrow(
      "firestore unavailable",
    );

    expect(notify).not.toHaveBeenCalled();

    // Twitch's retry redelivers the same stream session (same started_at).
    // It must actually be attempted, not silently skipped as a flap dedup -
    // the failed first attempt never got far enough to have sent anything.
    await service.handleStreamOnline(event);

    expect(notify).toHaveBeenCalledOnce();
  });

  describe("flapping stream dedup", () => {
    it("skips a second stream.online event for the same stream session", async () => {
      vi.spyOn(logger, "info").mockReturnValue();

      const { service, notify } = setup({
        streamers: [buildStreamer({ id: "streamer-1", users: ["user-1"] })],
        users: [buildUser({ id: "user-1" })],
      });

      await service.handleStreamOnline(event);
      await service.handleStreamOnline({
        ...event,
        // A redelivery/flap a few seconds later, well within the dedup
        // window, but with a distinct Twitch message id (not modeled here -
        // replay-store dedup is by message id, this is by stream session).
        started_at: "2026-06-29T00:00:07Z",
      });

      expect(notify).toHaveBeenCalledOnce();
    });

    it("notifies again for a genuinely new stream session outside the dedup window", async () => {
      const { service, notify } = setup({
        streamers: [buildStreamer({ id: "streamer-1", users: ["user-1"] })],
        users: [buildUser({ id: "user-1" })],
      });

      await service.handleStreamOnline(event);
      await service.handleStreamOnline({
        ...event,
        started_at: "2026-06-29T01:00:00Z",
      });

      expect(notify).toHaveBeenCalledTimes(2);
    });

    it("tracks dedup state independently per streamer", async () => {
      const otherStreamer: TwitchStreamer = {
        id: "streamer-2",
        login: "other",
        display_name: "Other",
        profile_image_url: "https://example.com/avatar2.png",
      };

      const { service, notify } = setup({
        knownStreamers: [twitchStreamer, otherStreamer],
        streamers: [
          buildStreamer({ id: "streamer-1", users: ["user-1"] }),
          buildStreamer({ id: "streamer-2", users: ["user-1"] }),
        ],
        users: [buildUser({ id: "user-1" })],
      });

      await service.handleStreamOnline(event);
      await service.handleStreamOnline({
        ...event,
        broadcaster_user_id: "streamer-2",
        broadcaster_user_login: "other",
      });

      expect(notify).toHaveBeenCalledTimes(2);
    });
  });
});
