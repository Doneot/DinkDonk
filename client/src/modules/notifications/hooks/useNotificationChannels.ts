import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  disableWebPushNotifications,
  enableWebPushNotifications,
  fetchNotificationChannels,
  getExistingPushSubscription,
  isWebPushSupported,
  setNotificationChannelPreference,
} from "../api";
import { notifyActionError } from "../../../shared/api/errorToast";
import { useAuth } from "../../../context/authContextValue";
import type { NotificationChannelId } from "../../../shared/types/api";

// One state/toggle shape per channel, so a future channel (email, a native
// app, ...) is "add a block shaped like these two", not a UI rewrite.
export function useNotificationChannels() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [busyChannel, setBusyChannel] = useState<NotificationChannelId | null>(
    null,
  );
  const [discordOptedIn, setDiscordOptedIn] = useState(true);
  const [webPushSupported, setWebPushSupported] = useState(true);
  const [webPushEnabled, setWebPushEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const supported = isWebPushSupported();

      const [channels, existingSubscription] = await Promise.all([
        fetchNotificationChannels().catch(() => null),
        supported ? getExistingPushSubscription() : Promise.resolve(null),
      ]);

      if (!mounted) return;

      if (channels) setDiscordOptedIn(channels.discord.optedIn);
      setWebPushSupported(supported);
      setWebPushEnabled(Boolean(existingSubscription));
      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const toggleDiscord = useCallback(
    async (enabled: boolean) => {
      const previous = discordOptedIn;

      setBusyChannel("discord");
      setDiscordOptedIn(enabled);

      try {
        await setNotificationChannelPreference("discord", enabled);
      } catch (err) {
        setDiscordOptedIn(previous);
        notifyActionError(err, "Failed to update your Discord notification preference.");
      } finally {
        setBusyChannel(null);
      }
    },
    [discordOptedIn],
  );

  const toggleWebPush = useCallback(async (enabled: boolean) => {
    setBusyChannel("webPush");

    try {
      if (enabled) {
        await enableWebPushNotifications();
        setWebPushEnabled(true);
        toast.success("Browser notifications enabled.");
      } else {
        await disableWebPushNotifications();
        setWebPushEnabled(false);
        toast.success("Browser notifications disabled on this device.");
      }
    } catch (err) {
      notifyActionError(
        err,
        `Failed to ${enabled ? "enable" : "disable"} browser notifications.`,
      );
    } finally {
      setBusyChannel(null);
    }
  }, []);

  return {
    loading,
    discord: {
      // Not the same thing: an account can be linked but still not
      // "capable" (bot not in a shared server, DMs closed) - the two cases
      // need different follow-up actions (connect vs. invite/re-check).
      linked: Boolean(user?.providers?.includes("discord")),
      capable: Boolean(user?.canReceiveDM),
      optedIn: discordOptedIn,
      busy: busyChannel === "discord",
      toggle: toggleDiscord,
    },
    webPush: {
      supported: webPushSupported,
      enabled: webPushEnabled,
      busy: busyChannel === "webPush",
      toggle: toggleWebPush,
    },
  };
}
