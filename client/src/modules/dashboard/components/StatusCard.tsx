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
    <div className="p-4 sm:p-5">
      <div className="font-mono text-[0.66rem] uppercase tracking-widest text-ink-faint mb-2">
        Signal
      </div>
      <div className="flex items-center gap-2 font-mono text-2xl tabular-nums">
        {status === "loading" ? (
          <span className="text-ink-dim">—</span>
        ) : (
          <>
            <span className={`tally ${status === "Online" ? "is-on" : ""}`} />
            <span className={status === "Online" ? "text-online" : "text-live"}>
              {status}
            </span>
          </>
        )}
      </div>
      <div className="font-mono text-[0.7rem] text-ink-faint mt-1">
        bot connected to Discord
      </div>
    </div>
  );
};

export default StatusCard;
