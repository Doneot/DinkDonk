// src/modules/auth/components/UserMenu.tsx
import { useCallback, useRef, useState, type KeyboardEvent } from "react";
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
          className="rounded-full cursor-pointer border border-seam hover:border-accent transition focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <img
            src={user?.avatarUrl || "/default-avatar.svg"}
            alt=""
            loading="lazy"
            // Google's avatar CDN (lh3.googleusercontent.com) intermittently
            // rejects the request based on the Referer header a plain <img>
            // sends - most visible right after a brand-new Google sign-in,
            // before the browser has ever fetched that URL. Dropping the
            // referrer avoids that rejection instead of relying on a reload
            // to eventually get a request the CDN accepts.
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-full"
          />
        </button>
        {open && (
          <div
            role="menu"
            aria-label="Account menu"
            className="absolute right-0 top-full mt-1 w-48 bg-panel-2 border border-seam shadow-lg rounded-md overflow-hidden"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 !bg-transparent hover:!bg-tile text-sm text-live cursor-pointer"
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
