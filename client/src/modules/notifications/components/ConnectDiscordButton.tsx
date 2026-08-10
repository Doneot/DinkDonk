import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";

const ConnectDiscordButton = () => {
  const handleClick = () => {
    window.location.href = "/api/auth/discord/link";
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="bg-[#5865F2] text-white font-bold text-base px-5 py-2 rounded-md inline-flex items-center gap-2 hover:bg-[#4752C4] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg focus:ring-[#5865F2] cursor-pointer"
      aria-label="Connect your Discord account"
    >
      <FontAwesomeIcon icon={faDiscord} />
      Connect Discord
    </button>
  );
};

export default ConnectDiscordButton;
