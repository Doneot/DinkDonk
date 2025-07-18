// src/hooks/useAuth.js
import { useEffect, useState } from "react";
import axios from "../api";

export const useAuth = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    axios
      .get("/auth/user", { withCredentials: true })
      .then((res) => setUser(res.data))
      .catch(() => setUser(null));
  }, []);

  return user;
};
