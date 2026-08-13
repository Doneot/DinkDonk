import ngrok from "@ngrok/ngrok";

import { env } from "../../shared/config/env.js";
import { assertDefined } from "../../shared/utils/assert.js";
import type { Tunnel } from "./Tunnel.js";

export async function startNgrokTunnel(): Promise<Tunnel> {
  const listener = await ngrok.forward({
    addr: env.port,
    authtoken: assertDefined(env.tunneling.ngrok.authToken, "Ngrok Auth Token"),
  });

  const url = listener.url();

  if (!url) {
    throw new Error("Failed to create ngrok tunnel");
  }

  return {
    url,

    stop: () => listener.close(),
  };
}
