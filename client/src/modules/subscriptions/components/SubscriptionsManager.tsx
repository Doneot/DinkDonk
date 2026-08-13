import { useSubscriptions } from "../hooks/useSubscriptions";
import StreamerSearch from "./StreamerSearch";
import SubscriptionsList from "./SubscriptionsList";

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
    <div className="relative w-full">
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
