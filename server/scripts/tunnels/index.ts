import type { ChildProcess } from "node:child_process";

import { startSshTunnel } from "./sshTunnel.js";
import { getNgrokUrl } from "./ngrokTunnel.js";

export type TunnelResult = {
  url: string;
  process?: ChildProcess;
};

export async function startTunnel(
  type: "ngrok" | "ssh",
): Promise<TunnelResult> {
  switch (type) {
    case "ssh": {
      return {
        url: "https://dev.dinkdonk.donuts.ovh",
        process: startSshTunnel(),
      };
    }

    case "ngrok": {
      return {
        url: await getNgrokUrl(),
      };
    }
  }
}