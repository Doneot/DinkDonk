import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";

interface DiscordInviteButtonProps {
  inviteLink: string;
}

const DiscordInviteButton = ({ inviteLink }: DiscordInviteButtonProps) => {
  const handleClick = () => {
    window.open(inviteLink, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      onClick={handleClick}
      className="bg-[#5865F2] text-white font-bold text-base px-5 py-2 rounded-md inline-flex items-center gap-2 hover:bg-[#4752C4] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg focus:ring-[#5865F2] cursor-pointer"
      aria-label="Invite DinkDonk to your Discord server"
    >
      <FontAwesomeIcon icon={faDiscord} />
      Invite DinkDonk
    </button>
  );
};

export default DiscordInviteButton;
