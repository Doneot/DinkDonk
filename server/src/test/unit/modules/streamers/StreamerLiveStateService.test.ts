import { describe, expect, it, vi } from "vitest";

import { StreamerLiveStateService } from "../../../../modules/streamers/application/StreamerLiveStateService.js";
import { InMemoryStreamerRepository } from "../../../repositories/inMemory/InMemoryStreamerRepository.js";
import { buildStreamer } from "../../../builders/streamer.js";
import type {
  TwitchEventSubStreamOfflineEvent,
  TwitchEventSubStreamOnlineEvent,
} from "../../../../modules/twitch/domain/Twitch.js";

function setup() {
  const streamers = new InMemoryStreamerRepository();
  const notifySocketUser = vi.fn();

  return {
    streamers,
    notifySocketUser,
    service: new StreamerLiveStateService(streamers, notifySocketUser),
  };
}

const onlineEvent: TwitchEventSubStreamOnlineEvent = {
  broadcaster_user_id: "streamer-1",
  broadcaster_user_login: "streamer",
  broadcaster_user_name: "Streamer",
  type: "live",
  started_at: "2024-01-01T12:00:00.000Z",
};

const offlineEvent: TwitchEventSubStreamOfflineEvent = {
  broadcaster_user_id: "streamer-1",
  broadcaster_user_login: "streamer",
  broadcaster_user_name: "Streamer",
};

describe("StreamerLiveStateService", () => {
  describe("handleStreamOnline", () => {
    it("marks the streamer live using the event's own broadcaster id", async () => {
      const { service, streamers } = setup();

      streamers.seed(buildStreamer({ id: "streamer-1" }));

      await service.handleStreamOnline(onlineEvent);

      await expect(streamers.getStreamer("streamer-1")).resolves.toEqual({
        id: "streamer-1",
        isLive: true,
        liveSince: "2024-01-01T12:00:00.000Z",
      });
    });

    it("notifies every subscriber over the socket notifier", async () => {
      const { service, streamers, notifySocketUser } = setup();

      streamers.seed(
        buildStreamer({ id: "streamer-1", users: ["user-1", "user-2"] }),
      );

      await service.handleStreamOnline(onlineEvent);

      expect(notifySocketUser).toHaveBeenCalledTimes(2);
      expect(notifySocketUser).toHaveBeenCalledWith("user-1", "streamer_live_changed", {
        streamerId: "streamer-1",
        isLive: true,
        liveSince: "2024-01-01T12:00:00.000Z",
      });
      expect(notifySocketUser).toHaveBeenCalledWith("user-2", "streamer_live_changed", {
        streamerId: "streamer-1",
        isLive: true,
        liveSince: "2024-01-01T12:00:00.000Z",
      });
    });

    it("does nothing when the streamer has no record (already garbage collected)", async () => {
      const { service, notifySocketUser } = setup();

      await service.handleStreamOnline(onlineEvent);

      expect(notifySocketUser).not.toHaveBeenCalled();
    });
  });

  describe("handleStreamOffline", () => {
    it("clears live state", async () => {
      const { service, streamers } = setup();

      streamers.seed(
        buildStreamer({
          id: "streamer-1",
          isLive: true,
          liveSince: "2024-01-01T12:00:00.000Z",
        }),
      );

      await service.handleStreamOffline(offlineEvent);

      await expect(streamers.getStreamer("streamer-1")).resolves.toEqual({
        id: "streamer-1",
        isLive: false,
        liveSince: null,
      });
    });

    it("notifies subscribers that the streamer went offline", async () => {
      const { service, streamers, notifySocketUser } = setup();

      streamers.seed(buildStreamer({ id: "streamer-1", users: ["user-1"] }));

      await service.handleStreamOffline(offlineEvent);

      expect(notifySocketUser).toHaveBeenCalledWith(
        "user-1",
        "streamer_live_changed",
        { streamerId: "streamer-1", isLive: false, liveSince: null },
      );
    });
  });
});
