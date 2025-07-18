import StatusCard from "../components/StatusCard";
import BotUsersCard from "../components/BotUsersCard";
import StreamersManager from "../components/StreamersManager";

const Dashboard = () => {
  return (
    <div className="p-8 bg-gray-100 min-h-screen">
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-6">
          <StatusCard />
          <BotUsersCard />
        </div>
        <div className="space-y-6 lg:col-span-2">
          <StreamersManager />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
