// src/components/UserMenu.jsx
import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/authContextValue";

const UserMenu = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    window.location.href = "/api/auth/logout";
  };

  return (
    <div className="p-4 flex justify-end bg-transparent" ref={menuRef}>
      <div className="relative">
        <img
          src={
            user?.avatar
              ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
              : "/default-avatar.png"
          }
          alt="Avatar"
          className="w-10 h-10 rounded-full cursor-pointer border border-gray-300 hover:shadow transition"
          onClick={() => setOpen(!open)}
        />
        {open && (
          <div className="absolute right-0 top-full mt-1 w-40 bg-white shadow-lg rounded-lg">
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
