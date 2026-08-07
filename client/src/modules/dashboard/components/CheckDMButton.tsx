import { useState } from "react";

type Status = "idle" | "loading" | "canDM" | "cannotDM" | "error";

interface CheckDMButtonProps {
  checkDMFunction: () => Promise<boolean>;
}

const CheckDMButton = ({ checkDMFunction }: CheckDMButtonProps) => {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCheck = async () => {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const canDM = await checkDMFunction();
      setStatus(canDM ? "canDM" : "cannotDM");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    }
  };

  let buttonText: string;
  switch (status) {
    case "idle":
      buttonText = "Check DM Ability";
      break;
    case "loading":
      buttonText = "Checking...";
      break;
    case "canDM":
      buttonText = "User can receive DMs ✅";
      break;
    case "cannotDM":
      buttonText = "User cannot receive DMs ❌";
      break;
    case "error":
      buttonText = `Error: ${errorMessage}`;
      break;
    default:
      buttonText = "Check DM Ability";
  }

  const baseClasses =
    "px-5 py-2 rounded-md font-bold text-white text-base transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2";
  let statusClasses = "bg-[#5865F2] hover:bg-[#4752C4] focus:ring-[#5865F2]";

  if (status === "canDM") {
    statusClasses = "bg-green-600 hover:bg-green-500 focus:ring-green-600";
  } else if (status === "cannotDM" || status === "error") {
    statusClasses = "bg-red-600 hover:bg-red-500 focus:ring-red-600";
  }

  const disabledClasses =
    status === "loading" ? "opacity-60 cursor-not-allowed" : "cursor-pointer";

  return (
    <button
      onClick={handleCheck}
      disabled={status === "loading"}
      className={`${baseClasses} ${statusClasses} ${disabledClasses}`}
    >
      {buttonText}
    </button>
  );
};

export default CheckDMButton;
