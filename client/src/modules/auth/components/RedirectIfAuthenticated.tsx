import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/authContextValue";

const RedirectIfAuthenticated = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard");
    }
  }, [user, loading, navigate]);

  if (loading)
    return <div className="text-center mt-10 text-lg">Loading...</div>;
  return children;
};

export default RedirectIfAuthenticated;
