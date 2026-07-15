import { startNgrokTunnel } from "./ngrokTunnel.js";
import { startSshTunnel } from "./sshTunnel.js";
import type { Tunnel } from "./Tunnel.js";

export async function startTunnel(type: "ngrok" | "ssh"): Promise<Tunnel> {
  switch (type) {
    case "ngrok":
      return startNgrokTunnel();

    case "ssh":
      return startSshTunnel();
  }
}
