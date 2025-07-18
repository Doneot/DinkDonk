import { useEffect, useState } from "react";
import api from "../api";

const StatusCard = () => {
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    api.get("/status").then((res) => {
      setStatus(res.data.online ? "Online" : "Offline");
    });
  }, []);

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-xl font-semibold text-gray-700">Bot Status</h2>
      <p
        className={`mt-4 text-2xl ${
          status === "Online" ? "text-green-500" : "text-red-500"
        }`}
      >
        {status}
      </p>
    </div>
  );
};

export default StatusCard;
