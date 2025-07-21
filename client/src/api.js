import axios from "axios";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

const api = axios.create({
  baseURL: "/api", // update if your API uses a different port or prefix
  withCredentials: true, // enables cookies for Discord auth sessions
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const navigate = useNavigate?.() || (() => {});

    if (error.response?.status === 401) {
      toast.error("Session expired. Please log in again.");
      navigate("/");
    }
    return Promise.reject(error);
  }
);

export default api;
