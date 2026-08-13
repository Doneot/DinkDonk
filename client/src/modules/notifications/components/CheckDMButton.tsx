import { useEffect, useRef, useState } from "react";

import { notifyActionError } from "../../../shared/api/errorToast";

type Status = "idle" | "loading" | "canDM" | "cannotDM";

interface CheckDMButtonProps {
  checkDMFunction: () => Promise<boolean>;
}

const RESULT_DISPLAY_MS = 4000;

const LABELS: Record<Status, string> = {
  idle: "Not receiving notifications?",
  loading: "Checking…",
  canDM: "✓ DinkDonk can DM you",
  cannotDM: "✗ Can't DM you yet",
};

// Deliberately a quiet text link, not a colored button: the cell it lives in
// already shows the persistent On/Blocked status via the tally + toggle
// above, so this is just a self-serve "double check right now" prompt. The
// result still needs to be felt right where the click happened, though - a
// toast alone is easy to miss - so it flashes in place (color-coded, same
// online/live tokens the rest of the app uses for state) before reverting.
const CheckDMButton = ({ checkDMFunction }: CheckDMButtonProps) => {
  const [status, setStatus] = useState<Status>("idle");
  const revertTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(revertTimeout.current), []);

  const handleCheck = async () => {
    clearTimeout(revertTimeout.current);
    setStatus("loading");

    try {
      const canDM = await checkDMFunction();

      setStatus(canDM ? "canDM" : "cannotDM");
      revertTimeout.current = setTimeout(
        () => setStatus("idle"),
        RESULT_DISPLAY_MS,
      );
    } catch (error) {
      setStatus("idle");
      notifyActionError(error, "Failed to check DM ability.");
    }
  };

  const colorClass =
    status === "canDM"
      ? "text-online"
      : status === "cannotDM"
        ? "text-live"
        : "text-ink-faint hover:text-ink";

  return (
    <button
      type="button"
      onClick={handleCheck}
      disabled={status === "loading"}
      className={`font-mono text-[0.7rem] underline decoration-dotted underline-offset-2 transition disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed ${colorClass}`}
    >
      {LABELS[status]}
    </button>
  );
};

export default CheckDMButton;
