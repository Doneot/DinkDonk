import { useEffect, useState } from "react";
import { fetchAuthProviders } from "../api";
import type { AuthProvidersResponse } from "../../../shared/types/api";

export function useAuthProviders(): AuthProvidersResponse | null {
  const [config, setConfig] = useState<AuthProvidersResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchAuthProviders()
      .then((config) => {
        if (!cancelled) {
          setConfig(config);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Discord is always enabled server-side, so it's a safe fallback
          // if the providers endpoint itself is unreachable. There's no
          // sensible client-side fallback for discordInviteUrl (it depends
          // on the server's own client id) - callers already treat a falsy
          // value as "don't show the invite CTA yet".
          setConfig({ providers: ["discord"], discordInviteUrl: "" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}
