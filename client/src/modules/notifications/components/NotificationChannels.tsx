import { useCallback } from "react";

import { useAuth } from "../../../context/authContextValue";
import { useAuthProviders } from "../../auth/hooks/useAuthProviders";
import { checkCanReceiveDM } from "../api";
import { useNotificationChannels } from "../hooks/useNotificationChannels";
import ChannelCell from "./ChannelCell";
import CheckDMButton from "./CheckDMButton";
import ConnectDiscordButton from "./ConnectDiscordButton";
import DiscordInviteButton from "./DiscordInviteButton";

// Renders as a pair of cells (no wrapper of its own) so Dashboard can lay
// them out as part of the same instrument-strip grid as StatusCard/
// BotUsersCard, rather than a visually separate settings panel.
const NotificationChannels = () => {
  const { loading, discord, webPush } = useNotificationChannels();
  const { setUser } = useAuth();
  // Server-computed (from the app's own Discord client id), not a separate
  // frontend env var - see passport.ts's discordInviteUrl for why: this CTA
  // is too load-bearing to leave to something that's easy to forget to set.
  const auth = useAuthProviders();

  // CheckDMButton only knows its own inline status text - without this, a
  // successful re-check wouldn't update the toggle/status text above it
  // until the realtime "user_data_updated" broadcast happens to arrive.
  const checkDM = useCallback(async () => {
    const canReceiveDM = await checkCanReceiveDM();
    setUser((prev) => (prev ? { ...prev, canReceiveDM } : prev));
    return canReceiveDM;
  }, [setUser]);

  return (
    <>
      <ChannelCell
        label="Discord DMs"
        statusText={
          loading
            ? "Loading…"
            : !discord.linked
              ? "Not connected"
              : !discord.capable
                ? "Blocked"
                : discord.optedIn
                  ? "On"
                  : "Off"
        }
        subCaption={
          loading
            ? "checking your notification settings"
            : !discord.linked
              ? "connect your Discord account to enable"
              : discord.capable
                ? "direct message when a streamer goes live"
                : "invite the bot or re-check access below"
        }
        checked={!loading && discord.capable && discord.optedIn}
        disabled={loading || !discord.capable}
        busy={discord.busy}
        onToggle={discord.toggle}
      >
        {!discord.linked ? (
          <ConnectDiscordButton />
        ) : (
          // Always available once linked, not just while currently
          // "Blocked" - capability can go stale silently (the bot gets
          // removed from a shared server, DMs get closed) with nothing else
          // to tell the app until the next failed notification, so a way to
          // manually re-verify has to stay reachable even when things
          // currently look fine.
          <div className="flex flex-col items-start gap-2">
            {!discord.capable && auth?.discordInviteUrl && (
              <DiscordInviteButton inviteLink={auth.discordInviteUrl} />
            )}
            <CheckDMButton checkDMFunction={checkDM} />
          </div>
        )}
      </ChannelCell>

      <ChannelCell
        label="Browser push"
        statusText={
          loading
            ? "Loading…"
            : !webPush.supported
              ? "Unsupported"
              : webPush.enabled
                ? "On"
                : "Off"
        }
        subCaption={
          loading
            ? "checking your notification settings"
            : webPush.supported
              ? "native notification, this device"
              : "add to Home Screen on iPhone/iPad"
        }
        checked={!loading && webPush.enabled}
        disabled={loading || !webPush.supported}
        busy={webPush.busy}
        onToggle={webPush.toggle}
      />
    </>
  );
};

export default NotificationChannels;
