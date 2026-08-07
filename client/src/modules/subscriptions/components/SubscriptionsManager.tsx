import StreamerSearch from "./StreamerSearch";
import SubscriptionsList from "./SubscriptionsList";
import { useSubscriptions } from "../hooks/useSubscriptions";

interface SubscriptionsManagerProps {
  canReceiveDM?: boolean;
}

const SubscriptionsManager = ({ canReceiveDM }: SubscriptionsManagerProps) => {
  const {
    subscribedIds,
    enrichedSubscriptions,
    handleSubscribe,
    handleUnsubscribe,
    handleMessageChange,
  } = useSubscriptions();

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
