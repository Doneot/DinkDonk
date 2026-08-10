import api from "../../shared/api/client";
import type { StatusResponse, UserCountResponse } from "../../shared/types/api";

export function fetchStatus(): Promise<boolean> {
  return api.get<StatusResponse>("/status").then((res) => res.data.online);
}

export function fetchUserCount(): Promise<number> {
  return api.get<UserCountResponse>("/user-count").then((res) => res.data.count);
}
