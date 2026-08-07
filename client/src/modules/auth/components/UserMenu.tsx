// src/modules/auth/components/UserMenu.tsx
import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { toast } from "react-toastify";
import { useAuth } from "../../../context/authContextValue";
import { useNavigate } from "react-router-dom";
import { useClickOutside } from "../../../shared/hooks/useClickOutside";

const UserMenu = () => {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  const close = useCallback(() => setOpen(false), []);
  useClickOutside(menuRef, close);

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape" && open) {
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch {
      toast.error("Failed to log out. Please try again.");
    }
  };

  return (
    <div className="p-4 flex justify-end bg-transparent" ref={menuRef}>
      <div className="relative">
        <button
          type="button"
          ref={triggerRef}
          onClick={() => setOpen((prev) => !prev)}
          onKeyDown={handleTriggerKeyDown}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Open account menu"
          className="rounded-full cursor-pointer border border-gray-300 hover:shadow transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <img
            src={user?.avatarUrl || "/default-avatar.svg"}
            alt=""
            loading="lazy"
            className="w-10 h-10 rounded-full"
          />
        </button>
        {open && (
          <div
            role="menu"
            aria-label="Account menu"
            className="absolute right-0 top-full mt-1 w-48 bg-white shadow-lg rounded-lg"
          >
            {!user?.providers?.includes("discord") && (
              <button
                type="button"
                role="menuitem"
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
              type="button"
              role="menuitem"
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
