import StatusCard from "../components/StatusCard";
import BotUsersCard from "../components/BotUsersCard";
import StreamersManager from "../components/StreamersManager";
import DiscordInviteButton from "../components/DiscordInviteButton";
import CheckDMButton from "../components/CheckDMButton";
import { useAuth } from "../context/AuthContext";
import api from "../api";

const Dashboard = () => {
  const { user } = useAuth();

  const checkIfUserCanReceiveDM = async () => {
    try {
      const canDM = (await api.get("/can-receive-DM")).data.canReceiveDM;
      return canDM;
    } catch (err) {
      console.error("Failed to check DM permission", err);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-100 min-h-screen">
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 my-6 lg:my-10">
          <StatusCard />
          <BotUsersCard />
          {!user?.canReceiveDM && (
            <DiscordInviteButton inviteLink={import.meta.env.VITE_INVITE_URL} />
          )}
          <CheckDMButton
            userId={user.id}
            checkDMFunction={checkIfUserCanReceiveDM}
          />
        </div>

        {/* Right column */}
        <div className="space-y-6 lg:col-span-2">
          <StreamersManager
            canReceiveDM={user?.canReceiveDM}
            streamers={user?.streamers}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
