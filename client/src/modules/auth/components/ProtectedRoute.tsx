import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../../../context/authContextValue";

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading)
    return <div className="text-center mt-10 text-lg">Loading...</div>;
  if (!user) return <Navigate to="/" replace />;

  return children;
};

export default ProtectedRoute;
