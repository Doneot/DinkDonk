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

// Each provider's own brand color, so the icon reads correctly on the
// button's white background instead of all rendering in the same tone.
const PROVIDER_ICON_COLORS: Record<Provider, string> = {
  discord: "text-[#5865F2]",
  google: "text-[#4285F4]",
  twitch: "text-[#9146FF]",
};

const Login = () => {
  const providers = useAuthProviders();

  if (!providers) {
    return <p className="text-center mt-10 text-lg">Loading...</p>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh+100px)] bg-gradient-to-br from-indigo-600 to-purple-700 text-white px-4">
      <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center">
        Log in to DinkDonk
      </h1>
      <div className="flex flex-col gap-4 w-full max-w-xs">
        {providers.map((provider) => (
          <button
            key={provider}
            onClick={() => {
              window.location.href = `/api/auth/${provider}`;
            }}
            className="bg-white text-purple-700 font-semibold px-6 py-3 rounded-xl shadow-md hover:scale-105 transition cursor-pointer inline-flex items-center justify-center gap-2"
          >
            {PROVIDER_ICONS[provider] && (
              <FontAwesomeIcon
                icon={PROVIDER_ICONS[provider]}
                className={PROVIDER_ICON_COLORS[provider]}
              />
            )}
            {PROVIDER_LABELS[provider] ?? `Continue with ${provider}`}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Login;
