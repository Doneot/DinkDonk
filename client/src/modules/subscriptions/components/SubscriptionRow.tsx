import { memo } from "react";
import type { EnrichedSubscription } from "../types";

interface SubscriptionRowProps {
  subscription: EnrichedSubscription;
  handleUnsubscribe: (id: string) => void;
  handleMessageChange: (id: string, message: string) => void;
  disabled?: boolean;
}

const SubscriptionRow = ({
  subscription,
  handleUnsubscribe,
  handleMessageChange,
  disabled,
}: SubscriptionRowProps) => {
  const hasCustomMessage = Boolean(subscription.notification_message);

  return (
    <li
      className={`border rounded-lg p-4 ${
        subscription.isLive
          ? "live-glow border-live/40"
          : "bg-tile border-seam-soft"
      }`}
    >
      {/* Avatar + name */}
      <div className="flex items-center gap-3 min-w-0">
        {subscription.avatar ? (
          <img
            src={subscription.avatar}
            alt=""
            loading="lazy"
            className="w-9 h-9 rounded-full flex-none"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-panel-2 flex-none" />
        )}
        <div className="min-w-0">
          <span className="text-ink font-medium truncate block">
            {subscription.name}
          </span>
          <span
            className={`font-mono text-[0.62rem] uppercase tracking-wider flex items-center gap-1.5 ${
              subscription.isLive ? "text-live" : "text-ink-faint"
            }`}
          >
            <span
              className={`tally ${subscription.isLive ? "is-live" : "is-tracked"}`}
              aria-hidden="true"
            />
            {subscription.isLive ? "Live now" : "Subscribed"}
          </span>
        </div>
      </div>

      {/* Message config, tucked behind a disclosure */}
      <details className="mt-3 pt-3 border-t border-seam-soft">
        <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center justify-between font-mono text-[0.68rem] uppercase tracking-wider text-ink-dim">
          <span>Message</span>
          <span className="text-ink-faint">
            {hasCustomMessage ? "custom" : "default"}
          </span>
        </summary>
        <input
          type="text"
          value={subscription.notification_message || ""}
          onChange={(e) => handleMessageChange(subscription.id, e.target.value)}
          placeholder="Custom notification message"
          aria-label={`Notification message for ${subscription.name || "this streamer"}`}
          className={`mt-2 w-full p-2 border rounded-md text-sm text-ink ${
            disabled
              ? "bg-panel-2 border-seam-soft text-ink-faint cursor-not-allowed"
              : "bg-panel border-seam"
          }`}
          disabled={disabled}
        />
      </details>

      {/* Unsubscribe */}
      <button
        className="mt-3 w-full text-right font-mono text-[0.66rem] uppercase tracking-wider text-ink-faint hover:text-live transition disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        onClick={() => handleUnsubscribe(subscription.id)}
        disabled={disabled}
      >
        Unsubscribe
      </button>
    </li>
  );
};

export default memo(SubscriptionRow);
