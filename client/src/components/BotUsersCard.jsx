import { useEffect, useState } from "react";
import api from "../api";

const BotUsersCard = () => {
  const [userCount, setUserCount] = useState(null);

  useEffect(() => {
    api.get("/user-count").then((res) => {
      setUserCount(res.data.count);
    });
  }, []);

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-xl font-semibold text-gray-700">Bot Users</h2>
      <p className="mt-2 text-3xl text-indigo-600">
        {userCount !== null ? userCount : "Loading..."}
      </p>
    </div>
  );
};

export default BotUsersCard;
