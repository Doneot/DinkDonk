import api from "../../shared/api/client";
import type { AuthProvidersResponse } from "../../shared/types/api";

export function fetchAuthProviders(): Promise<AuthProvidersResponse> {
  return api
    .get<AuthProvidersResponse>("/auth/providers")
    .then((res) => res.data);
}
