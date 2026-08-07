import { useEffect, useMemo, useRef, useCallback, useState } from "react";
import {
  fetchStreamerProfiles,
  subscribeToStreamer,
  unsubscribeFromStreamer,
  updateNotificationMessage,
} from "../api";
import { notifyActionError } from "../../../shared/api/errorToast";
import { useAuth } from "../../../context/authContextValue";
import type { StreamerSummary, Subscription } from "../../../shared/types/api";
import type { EnrichedSubscription, StreamerProfile } from "../types";

// Assumes a single call site (true today, in SubscriptionsManager) - two
// simultaneous instances would each keep independent profileCache/
// requestedIds state and double-hydrate.
export function useSubscriptions() {
  const { user, setUser } = useAuth();

  // Memoized so an absent user.subscriptions doesn't produce a new []
  // reference every render, which would otherwise re-trigger the hydration
  // effect and the memoized view-models below on every unrelated re-render.
  const subscriptions = useMemo<Subscription[]>(
    () => user?.subscriptions ?? [],
    [user?.subscriptions],
  );

  // ----------------------------
  // PROFILE CACHE (REACTIVE STATE)
  // ----------------------------
  const [profileCache, setProfileCache] = useState<Record<string, StreamerProfile>>({});

  const saveTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Ids already fetched or in flight - kept out of the hydrateProfiles
  // dependency array so a cache update doesn't itself re-trigger hydration.
  const requestedIds = useRef<Set<string>>(new Set());

  // ----------------------------
  // HYDRATION (ONLY MISSING PROFILES)
  // ----------------------------
  const hydrateProfiles = useCallback(async (ids: string[]) => {
    const missingIds = ids.filter((id) => !requestedIds.current.has(id));

    if (!missingIds.length) return;

    missingIds.forEach((id) => requestedIds.current.add(id));

    try {
      const profiles = await fetchStreamerProfiles(missingIds);

      setProfileCache((prev) => {
        const next = { ...prev };

        for (const s of profiles) {
          next[s.id] = {
            name: s.name,
            avatar: s.avatar ?? "",
          };
        }

        return next;
      });
    } catch (err) {
      missingIds.forEach((id) => requestedIds.current.delete(id));
      console.error("Failed to fetch streamer profiles", err);
    }
  }, []);

  // ----------------------------
  // INITIAL + UPDATE HYDRATION
  // ----------------------------
  useEffect(() => {
    if (!subscriptions.length) return;

    const ids = subscriptions.map((s) => s.id);
    hydrateProfiles(ids);
  }, [subscriptions, hydrateProfiles]);

  // ----------------------------
  // CLEANUP PENDING AUTOSAVE TIMEOUTS ON UNMOUNT
  // ----------------------------
  useEffect(() => {
    const timeouts = saveTimeouts.current;
    return () => {
      Object.values(timeouts).forEach(clearTimeout);
    };
  }, []);

  // ----------------------------
  // SUBSCRIBE
  // ----------------------------
  const handleSubscribe = useCallback(
    async (streamer: StreamerSummary) => {
      try {
        await subscribeToStreamer(streamer.id);

        // immediately cache profile data we already have
        requestedIds.current.add(streamer.id);
        setProfileCache((prev) => ({
          ...prev,
          [streamer.id]: {
            name: streamer.name,
            avatar: streamer.avatar ?? "",
          },
        }));

        setUser((prev) =>
          prev
            ? {
                ...prev,
                subscriptions: [
                  ...(prev.subscriptions ?? []),
                  {
                    id: streamer.id,
                    notification_message: "",
                  },
                ],
              }
            : prev,
        );
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
    async (id: string) => {
      try {
        await unsubscribeFromStreamer(id);

        setUser((prev) =>
          prev
            ? {
                ...prev,
                subscriptions: (prev.subscriptions ?? []).filter((s) => s.id !== id),
              }
            : prev,
        );

        // cleanup cache + any pending autosave for this streamer
        requestedIds.current.delete(id);
        setProfileCache((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });

        clearTimeout(saveTimeouts.current[id]);
        delete saveTimeouts.current[id];
      } catch (err) {
        notifyActionError(err, "Failed to unsubscribe.");
      }
    },
    [setUser],
  );

  // ----------------------------
  // MESSAGE EDIT (AUTO-SAVE)
  // ----------------------------
  const handleMessageChange = useCallback(
    (id: string, message: string) => {
      setUser((prev) =>
        prev
          ? {
              ...prev,
              subscriptions: (prev.subscriptions ?? []).map((s) =>
                s.id === id ? { ...s, notification_message: message } : s,
              ),
            }
          : prev,
      );

      clearTimeout(saveTimeouts.current[id]);

      saveTimeouts.current[id] = setTimeout(() => {
        updateNotificationMessage(id, message).catch((err: unknown) =>
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
  const enrichedSubscriptions = useMemo<EnrichedSubscription[]>(() => {
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

  return {
    subscribedIds,
    enrichedSubscriptions,
    handleSubscribe,
    handleUnsubscribe,
    handleMessageChange,
  };
}
