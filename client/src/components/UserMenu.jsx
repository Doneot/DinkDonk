// src/components/UserMenu.jsx
import { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { useAuth } from "../context/authContextValue";
import { useNavigate } from "react-router-dom";

const UserMenu = () => {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="p-4 flex justify-end bg-transparent" ref={menuRef}>
      <div className="relative">
        <img
          src={user?.avatarUrl || "/default-avatar.png"}
          alt="Avatar"
          className="w-10 h-10 rounded-full cursor-pointer border border-gray-300 hover:shadow transition"
          onClick={() => setOpen(!open)}
        />
        {open && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-white shadow-lg rounded-lg">
            {!user?.providers?.includes("discord") && (
              <button
                onClick={() => {
                  window.location.href = "/api/auth/discord/link";
                }}
                className="w-full text-left px-4 py-2 !bg-white hover:bg-gray-100 text-sm text-gray-700 cursor-pointer inline-flex items-center gap-2"
              >
                <FontAwesomeIcon icon={faDiscord} className="text-[#5865F2]" />
                Connect Discord
              </button>
            )}
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 !bg-white hover:bg-gray-100 text-sm text-red-600 cursor-pointer"
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserMenu;
