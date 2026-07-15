import { env } from "../../shared/config/env.js";

import { startTunnel } from "../../infrastructure/tunneling/index.js";

import type { Runtime } from "./Runtime.js";

export async function createRuntime(): Promise<Runtime> {
  if (env.isProduction) {
    return {
      publicUrl: env.serverUrl,

      async dispose() {},
    };
  }

  const tunnel = await startTunnel(env.tunneling.provider ?? "ngrok");

  return {
    publicUrl: tunnel.url,

    dispose: async () => {
      await tunnel.stop();
    },
  };
}
