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
    <div className="p-4 sm:p-5">
      <div className="font-mono text-[0.66rem] uppercase tracking-widest text-ink-faint mb-2">
        Watchers
      </div>
      <div className="font-mono text-2xl tabular-nums text-ink">
        {userCount !== null ? userCount : "—"}
      </div>
      <div className="font-mono text-[0.7rem] text-ink-faint mt-1">
        accounts using DinkDonk
      </div>
    </div>
  );
};

export default BotUsersCard;
