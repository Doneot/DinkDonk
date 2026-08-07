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
  return (
    <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between border p-4 rounded-lg shadow-sm bg-gray-50 gap-3">
      {/* Avatar + Name */}
      <div className="flex items-center gap-3 min-w-0">
        {subscription.avatar ? (
          <img
            src={subscription.avatar}
            alt=""
            loading="lazy"
            className="w-10 h-10 rounded-full"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-200" />
        )}

        <span className="text-gray-800 font-medium truncate">
          {subscription.name}
        </span>
      </div>

      {/* Message input */}
      <input
        type="text"
        value={subscription.notification_message || ""}
        onChange={(e) => handleMessageChange(subscription.id, e.target.value)}
        placeholder="Custom notification message"
        aria-label={`Notification message for ${subscription.name || "this streamer"}`}
        className={`w-full sm:flex-1 mx-0 sm:mx-4 p-2 border rounded-md text-sm text-black ${
          disabled ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-white"
        }`}
        disabled={disabled}
      />

      {/* Unsubscribe */}
      <button
        className="w-full sm:w-auto px-4 py-2 rounded-md text-sm font-medium bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 cursor-pointer"
        onClick={() => handleUnsubscribe(subscription.id)}
        disabled={disabled}
      >
        Unsubscribe
      </button>
    </li>
  );
};

export default memo(SubscriptionRow);
