import { env } from "../../shared/config/env.js";
import type { Runtime } from "./Runtime.js";

export async function createRuntime(): Promise<Runtime> {
  if (env.isProduction) {
    return {
      publicUrl: env.serverUrl,

      async dispose() {},
    };
  }

  // Dynamically imported so the tunneling module tree (and its dev-only
  // dependencies like @ngrok/ngrok and tree-kill) is never resolved in
  // production, where it's neither installed nor needed.
  const { startTunnel } = await import("../../infrastructure/tunneling/index.js");

  const tunnel = await startTunnel(env.tunneling.provider ?? "ngrok");

  return {
    publicUrl: tunnel.url,

    dispose: async () => {
      await tunnel.stop();
    },
  };
}
