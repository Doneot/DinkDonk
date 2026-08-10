import StatusCard from "../modules/dashboard/components/StatusCard";
import BotUsersCard from "../modules/dashboard/components/BotUsersCard";
import SubscriptionsManager from "../modules/subscriptions/components/SubscriptionsManager";
import NotificationChannels from "../modules/notifications/components/NotificationChannels";
import { useAuth } from "../context/authContextValue";

const Dashboard = () => {
  const { user } = useAuth();

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-bg min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6 my-6 lg:my-10">
        <div className="rounded-lg border border-seam-soft bg-tile overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-seam-soft">
            <StatusCard />
            <BotUsersCard />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-seam-soft border-t border-seam-soft">
            <NotificationChannels />
          </div>
        </div>

        <SubscriptionsManager canReceiveDM={user?.canReceiveDM} />
      </div>
    </div>
  );
};

export default Dashboard;
