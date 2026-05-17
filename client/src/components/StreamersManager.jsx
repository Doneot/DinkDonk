import { useEffect, useRef, useState } from "react";
import api from "../services/api";
import StreamerSearch from "./StreamerSearch";
import SubscribedStreamersList from "./SubscribedStreamersList";

const StreamersManager = ({ canReceiveDM, streamers }) => {
  const [subscribedIds, setSubscribedIds] = useState([]);
  const [streamerData, setStreamerData] = useState({});
  const [infoCache, setInfoCache] = useState({});
  const [dirtyMessages, setDirtyMessages] = useState({});
  const [editingStreamerIds, setEditingStreamerIds] = useState(new Set());

  const saveTimeouts = useRef({});
  const stopEditTimeouts = useRef({});

  // Fetch subscribed streamer IDs on mount
  useEffect(() => {
    api
      .get("/streamers/subscribed-streamers")
      .then((res) => {
        setSubscribedIds(res.data.map((streamer) => streamer.streamer_id));
      })
      .catch((err) => console.error("Failed to fetch subscriptions", err));
  }, [streamers]);

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
              message: editingStreamerIds.has(id) ? prev[id]?.message : message,
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
            message: editingStreamerIds.has(id) ? prev[id]?.message : message,
          },
        }));
      } catch (err) {
        console.error(`Failed to fetch info or message for ${id}`, err);
      }
    });
  }, [subscribedIds, infoCache, editingStreamerIds]);

  // Debounced syncing & editing cleanup
  useEffect(() => {
    Object.entries(dirtyMessages).forEach(([id, message]) => {
      // Debounce save
      clearTimeout(saveTimeouts.current[id]);
      saveTimeouts.current[id] = setTimeout(() => {
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

      // Debounce stop-editing
      clearTimeout(stopEditTimeouts.current[id]);
      stopEditTimeouts.current[id] = setTimeout(() => {
        setEditingStreamerIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 2000);
    });
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

    setEditingStreamerIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
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
    <div className="relative w-full max-w-4xl mx-auto p-4 sm:p-6">
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
