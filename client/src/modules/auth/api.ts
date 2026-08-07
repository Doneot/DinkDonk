import api from "../../shared/api/client";
import type { AuthProvidersResponse, Provider } from "../../shared/types/api";

export function fetchAuthProviders(): Promise<Provider[]> {
  return api
    .get<AuthProvidersResponse>("/auth/providers")
    .then((res) => res.data.providers);
}
