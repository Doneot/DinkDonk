import StatusCard from "../modules/dashboard/components/StatusCard";
import BotUsersCard from "../modules/dashboard/components/BotUsersCard";
import SubscriptionsManager from "../modules/subscriptions/components/SubscriptionsManager";
import DiscordInviteButton from "../modules/dashboard/components/DiscordInviteButton";
import CheckDMButton from "../modules/dashboard/components/CheckDMButton";
import WebPushCard from "../modules/notifications/components/WebPushCard";
import { checkCanReceiveDM } from "../modules/dashboard/api";
import { useAuth } from "../context/authContextValue";
import { env } from "../config/env";

const Dashboard = () => {
  const { user } = useAuth();

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-100 min-h-screen">
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 my-6 lg:my-10">
          <StatusCard />
          <BotUsersCard />
          <WebPushCard />
          {!user?.canReceiveDM && env.inviteUrl && (
            <DiscordInviteButton inviteLink={env.inviteUrl} />
          )}
          <CheckDMButton checkDMFunction={checkCanReceiveDM} />
        </div>

        {/* Right column */}
        <div className="space-y-6 lg:col-span-2">
          <SubscriptionsManager canReceiveDM={user?.canReceiveDM} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
