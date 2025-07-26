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
    <div className="p-8 bg-gray-100 min-h-screen">
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-6 my-10 space-x-5">
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
