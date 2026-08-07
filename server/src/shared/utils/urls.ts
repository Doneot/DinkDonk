import { env } from "../config/env.js";

// Duplicating this isProduction ternary per call site was how the dev
// fallback port drifted out of sync in the past (see passport.ts's
// buildCallbackUrl) - kept here as the one place it's computed.
export function dashboardUrl(): string {
  return env.isProduction
    ? `${env.serverUrl}/dashboard`
    : "http://localhost:5000/dashboard";
}
