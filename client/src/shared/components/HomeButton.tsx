// src/shared/components/HomeButton.tsx
import { useAuth } from "../../context/authContextValue";
import { useNavigate } from "react-router-dom";

const HomeButton = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleClick = () => {
    if (user) {
      navigate("/dashboard");
    } else {
      navigate("/");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={user ? "Go to dashboard" : "Go to home"}
      className="rounded-md p-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <img
        src="/DinkDonk.png"
        alt=""
        className="h-24 w-24 select-none rounded-md"
        draggable={false}
      />
    </button>
  );
};

export default HomeButton;
