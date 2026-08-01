import { useEffect, useMemo, useRef, useCallback, useState } from "react";
import api from "../services/api";
import { notifyActionError } from "../services/errorToast";
import StreamerSearch from "./StreamerSearch";
import SubscriptionsList from "./SubscriptionsList";
import { useAuth } from "../context/authContextValue";

const SubscriptionsManager = ({ canReceiveDM }) => {
  const { user, setUser } = useAuth();

  const subscriptions = user?.subscriptions ?? [];

  // ----------------------------
  // PROFILE CACHE (REACTIVE STATE)
  // ----------------------------
  const [profileCache, setProfileCache] = useState({});

  const saveTimeouts = useRef({});

  // ----------------------------
  // HYDRATION (ONLY MISSING PROFILES)
  // ----------------------------
  const hydrateProfiles = useCallback(
    async (ids) => {
      const missingIds = ids.filter((id) => !profileCache[id]);

      if (!missingIds.length) return;

      try {
        const res = await api.post("/streamers/info", {
          ids: missingIds,
        });

        setProfileCache((prev) => {
          const next = { ...prev };

          for (const s of res.data) {
            next[s.id] = {
              name: s.name,
              avatar: s.avatar,
            };
          }

          return next;
        });
      } catch (err) {
        console.error("Failed to fetch streamer profiles", err);
      }
    },
    [profileCache],
  );

  // ----------------------------
  // INITIAL + UPDATE HYDRATION
  // ----------------------------
  useEffect(() => {
    if (!subscriptions.length) return;

    const ids = subscriptions.map((s) => s.id);
    hydrateProfiles(ids);
  }, [subscriptions, hydrateProfiles]);

  // ----------------------------
  // SUBSCRIBE
  // ----------------------------
  const handleSubscribe = useCallback(
    async (streamer) => {
      try {
        await api.post("/subscriptions", {
          streamerId: streamer.id,
        });

        // immediately cache profile data we already have
        setProfileCache((prev) => ({
          ...prev,
          [streamer.id]: {
            name: streamer.name,
            avatar: streamer.avatar,
          },
        }));

        setUser((prev) => ({
          ...prev,
          subscriptions: [
            ...(prev.subscriptions ?? []),
            {
              id: streamer.id,
              notification_message: "",
            },
          ],
        }));
      } catch (err) {
        notifyActionError(err, "Failed to subscribe.");
      }
    },
    [setUser],
  );

  // ----------------------------
  // UNSUBSCRIBE
  // ----------------------------
  const handleUnsubscribe = useCallback(
    (id) => {
      api
        .delete("/subscriptions", { params: { streamerId: id } })
        .then(() => {
          setUser((prev) => ({
            ...prev,
            subscriptions: prev.subscriptions.filter((s) => s.id !== id),
          }));

          // cleanup cache
          setProfileCache((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        })
        .catch((err) => notifyActionError(err, "Failed to unsubscribe."));
    },
    [setUser],
  );

  // ----------------------------
  // MESSAGE EDIT (AUTO-SAVE)
  // ----------------------------
  const handleMessageChange = useCallback(
    (id, message) => {
      setUser((prev) => ({
        ...prev,
        subscriptions: prev.subscriptions.map((s) =>
          s.id === id ? { ...s, notification_message: message } : s,
        ),
      }));

      clearTimeout(saveTimeouts.current[id]);

      saveTimeouts.current[id] = setTimeout(() => {
        api
          .post("/subscriptions/set-message", {
            id,
            message,
          })
          .catch((err) =>
            notifyActionError(err, "Failed to update notification message."),
          );
      }, 600);
    },
    [setUser],
  );

  // ----------------------------
  // DERIVED DATA
  // ----------------------------
  const subscribedIds = useMemo(
    () => subscriptions.map((s) => s.id),
    [subscriptions],
  );

  // ----------------------------
  // ENRICHED VIEW MODEL (NO FLICKER)
  // ----------------------------
  const enrichedSubscriptions = useMemo(() => {
    return subscriptions.map((s) => {
      const profile = profileCache[s.id];

      return {
        ...s,
        name: profile?.name || "",
        avatar: profile?.avatar || "",
        isHydrated: !!profile,
      };
    });
  }, [subscriptions, profileCache]);

  return (
    <div className="relative w-full max-w-4xl mx-auto p-4 sm:p-6">
      <StreamerSearch
        subscribedIds={subscribedIds}
        onSubscribe={handleSubscribe}
        disabled={!canReceiveDM}
      />

      <SubscriptionsList
        subscriptions={enrichedSubscriptions}
        handleUnsubscribe={handleUnsubscribe}
        handleMessageChange={handleMessageChange}
        disabled={!canReceiveDM}
      />
    </div>
  );
};

export default SubscriptionsManager;
