// src/shared/components/Navbar.tsx
import { useAuth } from "../../context/authContextValue";
import { useSocket } from "../../context/socketContextValue";
import HomeButton from "./HomeButton";
import UserMenu from "../../modules/auth/components/UserMenu";

const Navbar = () => {
  const { user } = useAuth();
  const { connected } = useSocket();

  return (
    <div className="w-full p-4 flex justify-between items-center bg-transparent">
      <HomeButton />
      {user && (
        <div className="flex items-center gap-3">
          <span
            className="flex items-center gap-1.5 text-xs text-gray-500"
            title={connected ? "Live updates connected" : "Live updates unavailable"}
          >
            <span
              className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-gray-400"}`}
              aria-hidden="true"
            />
            <span className="sr-only">
              {connected ? "Live updates connected" : "Live updates unavailable"}
            </span>
          </span>
          <UserMenu />
        </div>
      )}
    </div>
  );
};

export default Navbar;
