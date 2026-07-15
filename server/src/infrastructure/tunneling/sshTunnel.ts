import { spawn } from "node:child_process";
import { env } from "../../shared/config/env.js";
import { assertDefined } from "../../shared/utils/assert.js";
import type { Tunnel } from "./Tunnel.js";
import { killProcessTree } from "./process.js";

export async function startSshTunnel(): Promise<Tunnel> {
  const process = spawn(
    "ssh",
    [
      "-N",
      "-o",
      "ExitOnForwardFailure=yes",
      "-R",
      "9000:localhost:3000",
      "dinkdonk-vps",
    ],
    {
      stdio: "inherit",
    },
  );

  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 750);

    process.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`SSH tunnel exited (${code})`));
    });

    process.once("error", reject);
  });

  return {
    url: assertDefined(env.tunneling.ssh.tunnelUrl, "SSH Tunnel Url"),

    async stop() {
      if (process.pid) {
        await killProcessTree(process.pid);
      }
    },
  };
}
