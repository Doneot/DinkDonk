import axios from "axios";

const api = axios.create({
  baseURL: "/api", // update if your API uses a different port or prefix
  withCredentials: true, // enables cookies for Discord auth sessions
});

export default api;
