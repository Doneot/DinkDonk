import api from "../../shared/api/client";
import type {
  StatusResponse,
  UserCountResponse,
  CanReceiveDmResponse,
} from "../../shared/types/api";

export function fetchStatus(): Promise<boolean> {
  return api.get<StatusResponse>("/status").then((res) => res.data.online);
}

export function fetchUserCount(): Promise<number> {
  return api.get<UserCountResponse>("/user-count").then((res) => res.data.count);
}

export async function checkCanReceiveDM(): Promise<boolean> {
  try {
    const res = await api.get<CanReceiveDmResponse>("/can-receive-dm");
    return res.data.canReceiveDM;
  } catch (err) {
    console.error("Failed to check DM permission", err);
    throw err;
  }
}
