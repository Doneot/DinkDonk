// src/components/HomeButton.jsx
import { useAuth } from "../context/AuthContext";
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
    <img
      src="/DinkDonk.png"
      alt="DinkDonk Logo"
      onClick={handleClick}
      className="
        h-24
        w-24
        cursor-pointer
        select-none
        rounded-md
        p-1"
      draggable={false}
    />
  );
};

export default HomeButton;
