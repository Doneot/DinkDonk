import { useEffect, useState } from "react";
import { fetchUserCount } from "../api";

const BotUsersCard = () => {
  const [userCount, setUserCount] = useState<number | string | null>(null);

  useEffect(() => {
    fetchUserCount()
      .then((count) => {
        setUserCount(count);
      })
      .catch(() => {
        setUserCount("—");
      });
  }, []);

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-xl font-semibold text-gray-700">Users</h2>
      <p className="mt-2 text-3xl text-indigo-600">
        {userCount !== null ? userCount : "Loading..."}
      </p>
    </div>
  );
};

export default BotUsersCard;
