import { useEffect } from "react";

const LoginRedirect = () => {
  useEffect(() => {
    window.location.href = "/api/auth/discord"; // Update if needed
  }, []);

  return (
    <p className="text-center mt-10 text-lg">Redirecting to Discord login...</p>
  );
};

export default LoginRedirect;
