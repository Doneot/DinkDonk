// StreamersManager.js (parent container)
import { useEffect, useState } from "react";
import api from "../api";
import StreamerSearch from "./StreamerSearch";
import SubscribedStreamersList from "./SubscribedStreamersList";

const StreamersManager = () => {
  const [subscribedIds, setSubscribedIds] = useState([]);
  const [streamerData, setStreamerData] = useState({});
  const [messageMap, setMessageMap] = useState({});
  const [infoCache, setInfoCache] = useState({});
  const [searchFocused, setSearchFocused] = useState(false);

  // Fetch subscribed streamer IDs on mount
  useEffect(() => {
    api
      .get("/streamers/subscribed-streamers")
      .then((res) => {
        setSubscribedIds(res.data.map((streamer) => streamer.streamer_id));
      })
      .catch((err) => console.error("Failed to fetch subscriptions", err));
  }, []);

  // Fetch streamer info and messages whenever subscribedIds change
  useEffect(() => {
    if (subscribedIds.length === 0) {
      setStreamerData({});
      setMessageMap({});
      return;
    }

    subscribedIds.forEach(async (id) => {
      if (infoCache[id]) {
        try {
          const { data: { notification_message: message = "" } = {} } =
            await api.get("/streamers/get-message", { params: { id } });

          setStreamerData((prev) => ({
            ...prev,
            [id]: {
              ...infoCache[id],
              isSubscribed: true,
              message,
            },
          }));

          setMessageMap((prev) => ({ ...prev, [id]: message }));
        } catch (err) {
          console.error(
            `Failed to fetch message for cached streamer ${id}`,
            err
          );
        }
        return;
      }

      try {
        const { data: info } = await api.get("/streamers/info", {
          params: { id },
        });

        const { display_name, avatar } = info;

        const messageRes = await api.get("/streamers/get-message", {
          params: { id },
        });

        const message = messageRes.data.notification_message || "";

        const formattedInfo = {
          name: display_name,
          avatar,
        };

        setInfoCache((prev) => ({ ...prev, [id]: formattedInfo }));

        setStreamerData((prev) => ({
          ...prev,
          [id]: {
            ...formattedInfo,
            isSubscribed: true,
            message,
          },
        }));

        setMessageMap((prev) => ({ ...prev, [id]: message }));
      } catch (err) {
        console.error(`Failed to fetch info or message for ${id}`, err);
      }
    });
  }, [subscribedIds, infoCache]);

  // Debounced message updates on messageMap changes
  useEffect(() => {
    const timeouts = [];

    Object.entries(messageMap).forEach(([id, message]) => {
      const timeout = setTimeout(() => {
        api
          .post("/streamers/set-message", {
            streamer_id: id,
            message,
          })
          .catch((err) =>
            console.error(`Failed to update message for ${id}`, err)
          );
      }, 600);

      timeouts.push(timeout);
    });

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [messageMap]);

  // Handlers passed down
  const handleUnsubscribe = (id) => {
    api
      .post("/streamers/unsubscribe", { streamer_id: id })
      .then(() => {
        setSubscribedIds((prev) => prev.filter((sid) => sid !== id));
        setStreamerData((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            isSubscribed: false,
          },
        }));
      })
      .catch((err) => console.error("Unsubscribe failed", err));
  };

  const handleSubscribe = (id) => {
    api
      .post("/streamers/subscribe", { streamer_id: id })
      .then(() => {
        setSubscribedIds((prev) => [...prev, id]);
        setStreamerData((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            isSubscribed: true,
          },
        }));
      })
      .catch((err) => console.error("Subscribe failed", err));
  };

  const handleMessageChange = (id, msg) => {
    setMessageMap((prev) => ({ ...prev, [id]: msg }));
    setStreamerData((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        message: msg,
      },
    }));
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto p-6">
      <StreamerSearch
        subscribedIds={subscribedIds}
        setSubscribedIds={setSubscribedIds}
        onSubscribe={handleSubscribe}
        onFocusChange={setSearchFocused}
      />
      {/* When search is focused, the dropdown overlaps the list below */}
      <SubscribedStreamersList
        streamerData={streamerData}
        messageMap={messageMap}
        handleUnsubscribe={handleUnsubscribe}
        handleSubscribe={handleSubscribe}
        handleMessageChange={handleMessageChange}
      />
    </div>
  );
};

export default StreamersManager;
