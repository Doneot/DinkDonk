import StatusCard from "../components/StatusCard";
import BotUsersCard from "../components/BotUsersCard";
import SubscriptionsManager from "../components/SubscriptionsManager";
import DiscordInviteButton from "../components/DiscordInviteButton";
import CheckDMButton from "../components/CheckDMButton";
import WebPushCard from "../components/WebPushCard";
import { useAuth } from "../context/authContextValue";
import api from "../services/api";
import { env } from "../config/env";

const Dashboard = () => {
  const { user } = useAuth();

  const checkIfUserCanReceiveDM = async () => {
    try {
      const canDM = (await api.get("/can-receive-dm")).data.canReceiveDM;
      return canDM;
    } catch (err) {
      console.error("Failed to check DM permission", err);
      throw err;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-100 min-h-screen">
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 my-6 lg:my-10">
          <StatusCard />
          <BotUsersCard />
          <WebPushCard />
          {!user?.canReceiveDM && (
            <DiscordInviteButton inviteLink={env.inviteUrl} />
          )}
          <CheckDMButton
            userId={user.id}
            checkDMFunction={checkIfUserCanReceiveDM}
          />
        </div>

        {/* Right column */}
        <div className="space-y-6 lg:col-span-2">
          <SubscriptionsManager
            canReceiveDM={user?.canReceiveDM}
            subscriptions={user?.streamers}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
