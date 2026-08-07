import { memo } from "react";
import SubscriptionRow from "./SubscriptionRow";
import type { EnrichedSubscription } from "../types";

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
  return (
    <div className="p-4 sm:p-6 bg-white rounded-xl shadow-lg mt-6 w-full max-w-3xl mx-auto">
      <h2 className="text-lg sm:text-xl font-semibold mb-4 text-gray-700">
        Your Subscribed Streamers
      </h2>

      {subscriptions.length === 0 ? (
        <p className="text-gray-500">No streamers found.</p>
      ) : (
        <ul className="space-y-4">
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
