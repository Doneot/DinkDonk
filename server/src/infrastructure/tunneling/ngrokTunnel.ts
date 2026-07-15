import ngrok from "@ngrok/ngrok";
import { env } from "../../shared/config/env.js";
import { assertDefined } from "../../shared/utils/assert.js";
import type { Tunnel } from "./Tunnel.js";

let listener: Awaited<ReturnType<typeof ngrok.forward>> | undefined;

export async function startNgrokTunnel(): Promise<Tunnel> {
  listener = await ngrok.forward({
    addr: 3000,
    authtoken: assertDefined(env.tunneling.ngrok.authToken, "Ngrok Auth Token"),
  });

  const url = listener.url();

  if (!url) {
    throw new Error("Failed to create ngrok tunnel");
  }

  return {
    url,

    stop: () => {
      if (!listener) {
        throw new Error("Ngrok tunnel is not running");
      }

      return listener.close();
    },
  };
}
