import { useEffect, useState } from "react";
import { fetchAuthProviders } from "../api";
import type { Provider } from "../../../shared/types/api";

export function useAuthProviders(): Provider[] | null {
  const [providers, setProviders] = useState<Provider[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchAuthProviders()
      .then((providers) => {
        if (!cancelled) {
          setProviders(providers);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Discord is always enabled server-side, so it's a safe fallback
          // if the providers endpoint itself is unreachable.
          setProviders(["discord"]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return providers;
}
