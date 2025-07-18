// components/ProtectedRoute.js
import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading)
    return <div className="text-center mt-10 text-lg">Loading...</div>;
  if (!user) return <Navigate to="/" replace />;

  return children;
};

export default ProtectedRoute;
