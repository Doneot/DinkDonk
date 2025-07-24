import { useEffect, useState } from "react";
import api from "../api";
import StreamerSearch from "./StreamerSearch";
import SubscribedStreamersList from "./SubscribedStreamersList";
import { useAuth } from "../context/AuthContext";

<<<<<<< Updated upstream
const StreamersManager = ({ canReceiveDM }) => {
=======
const StreamersManager = ({ canReceiveDM , streamers }) => {
>>>>>>> Stashed changes
  const [subscribedIds, setSubscribedIds] = useState([]);
  const [streamerData, setStreamerData] = useState({});
  const [infoCache, setInfoCache] = useState({});
  const [dirtyMessages, setDirtyMessages] = useState({});

  // Fetch subscribed streamer IDs on mount
  useEffect(() => {
    api
      .get("/streamers/subscribed-streamers")
      .then((res) => {
        setSubscribedIds(res.data.map((streamer) => streamer.streamer_id));
      })
      .catch((err) => console.error("Failed to fetch subscriptions", err));
<<<<<<< Updated upstream
  }, []);
=======
  }, [streamers]);
>>>>>>> Stashed changes

  // Fetch info and messages for each subscribed streamer
  useEffect(() => {
    if (subscribedIds.length === 0) {
      setStreamerData({});
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
      } catch (err) {
        console.error(`Failed to fetch info or message for ${id}`, err);
      }
    });
  }, [subscribedIds, infoCache]);

  // Debounced syncing only for dirty messages
  useEffect(() => {
    const timeouts = [];

    Object.entries(dirtyMessages).forEach(([id, message]) => {
      const timeout = setTimeout(() => {
        api
          .post("/streamers/set-message", {
            streamer_id: id,
            message,
          })
          .then(() => {
            setDirtyMessages((prev) => {
              const updated = { ...prev };
              delete updated[id];
              return updated;
            });
          })
          .catch((err) => {
            console.error(`Failed to update message for ${id}`, err);
          });
      }, 600);

      timeouts.push(timeout);
    });

    return () => timeouts.forEach(clearTimeout);
  }, [dirtyMessages]);

  const handleMessageChange = (id, msg) => {
    setDirtyMessages((prev) => ({ ...prev, [id]: msg }));
    setStreamerData((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        message: msg,
      },
    }));
  };

  const handleUnsubscribe = (id) => {
    api
      .post("/streamers/unsubscribe", { streamer_id: id })
      .then(() => {
        setSubscribedIds((prev) => prev.filter((sid) => sid !== id));
        setStreamerData((prev) => {
          const updated = { ...prev };
          delete updated[id];
          return updated;
        });
      })
      .catch((err) => console.error("Unsubscribe failed", err));
  };

  const handleSubscribe = (id) => {
    api
      .post("/streamers/subscribe", { streamer_id: id })
      .then(() => setSubscribedIds((prev) => [...prev, id]))
      .catch((err) => console.error("Subscribe failed", err));
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto p-6">
      <StreamerSearch
        subscribedIds={subscribedIds}
        setSubscribedIds={setSubscribedIds}
        disabled={!canReceiveDM}
      />
      <SubscribedStreamersList
        streamerData={streamerData}
        handleUnsubscribe={handleUnsubscribe}
        handleSubscribe={handleSubscribe}
        handleMessageChange={handleMessageChange}
        disabled={!canReceiveDM}
      />
    </div>
  );
};

export default StreamersManager;
