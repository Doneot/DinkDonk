import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faDiscord,
  faGoogle,
  faTwitch,
} from "@fortawesome/free-brands-svg-icons";
import { useAuthProviders } from "../modules/auth/hooks/useAuthProviders";
import type { Provider } from "../shared/types/api";

const PROVIDER_LABELS: Record<Provider, string> = {
  discord: "Continue with Discord",
  google: "Continue with Google",
  twitch: "Continue with Twitch",
};

const PROVIDER_ICONS: Record<Provider, IconDefinition> = {
  discord: faDiscord,
  google: faGoogle,
  twitch: faTwitch,
};

// Each provider's own brand color, contained to the badge rather than the
// whole button, so the console feels consistent instead of a wall of brand.
const PROVIDER_BADGE_COLORS: Record<Provider, string> = {
  discord: "bg-[#5865F2] text-white",
  google: "bg-ink text-bg",
  twitch: "bg-[#9146FF] text-white",
};

const Login = () => {
  const auth = useAuthProviders();

  if (!auth) {
    return <p className="text-center mt-10 text-lg text-ink-dim">Loading...</p>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh+100px)] bg-bg text-ink px-4">
      <h1 className="font-display uppercase [font-stretch:condensed] text-3xl md:text-4xl font-bold mb-8 text-center">
        Sign in to DinkDonk
      </h1>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {auth.providers.map((provider) => (
          <button
            key={provider}
            onClick={() => {
              window.location.href = `/api/auth/${provider}`;
            }}
            className="bg-tile border border-seam text-ink font-medium px-4 py-3 rounded-md hover:bg-tile-hover transition cursor-pointer inline-flex items-center gap-3"
          >
            {PROVIDER_ICONS[provider] && (
              <span
                className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-sm ${PROVIDER_BADGE_COLORS[provider]}`}
                aria-hidden="true"
              >
                <FontAwesomeIcon icon={PROVIDER_ICONS[provider]} />
              </span>
            )}
            {PROVIDER_LABELS[provider] ?? `Continue with ${provider}`}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Login;
