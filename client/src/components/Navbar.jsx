// src/components/Navbar.jsx
import { useAuth } from "../context/authContextValue";
import HomeButton from "./HomeButton";
import UserMenu from "./UserMenu";

const Navbar = () => {
  const { user } = useAuth();

  return (
    <div className="w-full p-4 flex justify-between items-center bg-transparent">
      <HomeButton />
      {user && <UserMenu />}
    </div>
  );
};

export default Navbar;
