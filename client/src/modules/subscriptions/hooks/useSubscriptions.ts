import { useEffect, useMemo, useRef, useCallback, useState } from "react";
import {
  fetchStreamerProfiles,
  subscribeToStreamer,
  unsubscribeFromStreamer,
  updateNotificationMessage,
} from "../api";
import { notifyActionError } from "../../../shared/api/errorToast";
import { useAuth } from "../../../context/authContextValue";
import { useSocket } from "../../../context/socketContextValue";
import type { StreamerSummary, Subscription } from "../../../shared/types/api";
import type { EnrichedSubscription, StreamerProfile } from "../types";

// Assumes a single call site (true today, in SubscriptionsManager) - two
// simultaneous instances would each keep independent profileCache/
// requestedIds state and double-hydrate.
export function useSubscriptions() {
  const { user, setUser } = useAuth();
  const { liveStreamers } = useSocket();

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
            isLive: s.isLive,
            liveSince: s.liveSince,
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

        // Optimistic-only cache write - deliberately NOT added to
        // requestedIds. /streamers/search (where `streamer` came from)
        // doesn't carry live status, so this shows name/avatar instantly
        // (no flicker) while leaving the id "missing" so the hydration
        // effect below still fetches the real /streamers/info record - the
        // one that actually knows whether this streamer is live right now -
        // right after the subscription lands.
        setProfileCache((prev) => ({
          ...prev,
          [streamer.id]: {
            name: streamer.name,
            avatar: streamer.avatar ?? "",
            isLive: false,
            liveSince: null,
          },
        }));

        // Guarded against the streamer already being present: the socket's
        // "user_data_updated" broadcast (SocketContext, driven by a
        // Firestore onSnapshot on this same write) can land before this
        // optimistic update runs, since it doesn't wait on this HTTP
        // response - without the guard, whichever of the two runs second
        // would append a second copy of the same subscription.
        setUser((prev) => {
          if (!prev) return prev;

          if (prev.subscriptions?.some((s) => s.id === streamer.id)) {
            return prev;
          }

          return {
            ...prev,
            subscriptions: [
              ...(prev.subscriptions ?? []),
              {
                id: streamer.id,
                notification_message: "",
              },
            ],
          };
        });
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
      // A realtime push (once one has arrived this session) is always more
      // current than the snapshot /streamers/info returned at hydration
      // time, so it wins when both exist.
      const live = liveStreamers[s.id];

      return {
        ...s,
        name: profile?.name || "",
        avatar: profile?.avatar || "",
        isHydrated: !!profile,
        isLive: live?.isLive ?? profile?.isLive ?? false,
        liveSince: live ? live.liveSince : (profile?.liveSince ?? null),
      };
    });
  }, [subscriptions, profileCache, liveStreamers]);

  return {
    subscribedIds,
    enrichedSubscriptions,
    handleSubscribe,
    handleUnsubscribe,
    handleMessageChange,
  };
}
