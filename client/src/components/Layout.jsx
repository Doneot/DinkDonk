import { useAuth } from "../context/AuthContext";
import UserMenu from "./UserMenu";
import { Routes, Route } from "react-router-dom";
import RedirectIfAuthenticated from "./RedirectIfAuthenticated";
import ProtectedRoute from "./ProtectedRoute";
import Home from "../pages/Home";
import Dashboard from "../pages/Dashboard";
import LoginRedirect from "../pages/LoginRedirect";

const Layout = () => {
  const { user } = useAuth();

  return (
    <>
      {user && <UserMenu />}

      {/* Routes */}
      <Routes>
        <Route
          path="/"
          element={
            <RedirectIfAuthenticated>
              <Home />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<LoginRedirect />} />
      </Routes>
    </>
  );
};

export default Layout;
