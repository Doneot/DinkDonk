import StatusCard from "../modules/dashboard/components/StatusCard";
import BotUsersCard from "../modules/dashboard/components/BotUsersCard";
import SubscriptionsManager from "../modules/subscriptions/components/SubscriptionsManager";
import NotificationChannels from "../modules/notifications/components/NotificationChannels";
import ErrorBoundary from "../shared/components/ErrorBoundary";
import CardErrorFallback from "../shared/components/CardErrorFallback";
import { useAuth } from "../context/authContextValue";

const Dashboard = () => {
  const { user } = useAuth();

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-bg min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6 my-6 lg:my-10">
        <div className="rounded-lg border border-seam-soft bg-tile overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-seam-soft">
            <ErrorBoundary
              label="Dashboard.StatusCard"
              fallback={(retry) => <CardErrorFallback onRetry={retry} />}
            >
              <StatusCard />
            </ErrorBoundary>
            <ErrorBoundary
              label="Dashboard.BotUsersCard"
              fallback={(retry) => <CardErrorFallback onRetry={retry} />}
            >
              <BotUsersCard />
            </ErrorBoundary>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-seam-soft border-t border-seam-soft">
            <ErrorBoundary
              label="Dashboard.NotificationChannels"
              fallback={(retry) => (
                <CardErrorFallback onRetry={retry} className="sm:col-span-2" />
              )}
            >
              <NotificationChannels />
            </ErrorBoundary>
          </div>
        </div>

        <ErrorBoundary
          label="Dashboard.SubscriptionsManager"
          fallback={(retry) => (
            <div className="p-4 sm:p-6 bg-panel rounded-lg border border-seam-soft mt-6 w-full">
              <CardErrorFallback onRetry={retry} />
            </div>
          )}
        >
          <SubscriptionsManager canReceiveDM={user?.canReceiveDM} />
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default Dashboard;
