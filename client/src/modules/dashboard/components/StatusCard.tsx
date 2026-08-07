import { useEffect, useState } from "react";
import { fetchStatus } from "../api";

type Status = "loading" | "Online" | "Offline" | "Unknown";

const StatusCard = () => {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    fetchStatus()
      .then((online) => {
        setStatus(online ? "Online" : "Offline");
      })
      .catch(() => {
        setStatus("Unknown");
      });
  }, []);

  return (
    <div className="p-4 sm:p-6 bg-white rounded-xl shadow-lg text-center sm:text-left">
      <h2 className="text-lg sm:text-xl font-semibold text-gray-700">
        Bot Status
      </h2>
      <p
        className={`mt-2 sm:mt-4 text-xl sm:text-2xl ${
          status === "Online" ? "text-green-500" : "text-red-500"
        }`}
      >
        {status}
      </p>
    </div>
  );
};

export default StatusCard;
