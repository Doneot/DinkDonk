import { memo } from "react";

import type { EnrichedSubscription } from "../types";
import SubscriptionRow from "./SubscriptionRow";

interface SubscriptionsListProps {
  subscriptions: EnrichedSubscription[];
  handleUnsubscribe: (id: string) => void;
  handleMessageChange: (id: string, message: string) => void;
  disabled?: boolean;
}

const SubscriptionsList = ({
  subscriptions,
  handleUnsubscribe,
  handleMessageChange,
  disabled,
}: SubscriptionsListProps) => {
  const liveCount = subscriptions.filter((s) => s.isLive).length;

  return (
    <div className="p-4 sm:p-6 bg-panel rounded-lg border border-seam-soft mt-6 w-full">
      <h2 className="font-mono text-[0.7rem] uppercase tracking-widest text-ink-faint mb-4">
        Your streamers — {subscriptions.length}
        {liveCount > 0 && <span className="text-live"> · {liveCount} live</span>}
      </h2>

      {subscriptions.length === 0 ? (
        <p className="text-ink-faint">No streamers found.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {subscriptions.map((subscription) => (
            <SubscriptionRow
              key={subscription.id}
              subscription={subscription}
              handleUnsubscribe={handleUnsubscribe}
              handleMessageChange={handleMessageChange}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

export default memo(SubscriptionsList);
