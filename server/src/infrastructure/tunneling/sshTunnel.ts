import { spawn } from "node:child_process";
import { env } from "../../shared/config/env.js";
import { assertDefined } from "../../shared/utils/assert.js";
import { logger } from "../../shared/logger/logger.js";
import type { Tunnel } from "./Tunnel.js";
import { killProcessTree } from "./process.js";

export async function startSshTunnel(): Promise<Tunnel> {
  const process = spawn(
    "ssh",
    [
      "-N",
      "-o",
      "ExitOnForwardFailure=yes",
      // Never hangs waiting on an interactive prompt (password, unknown host
      // key confirmation, etc.) - fails fast instead, which a headless,
      // programmatically-spawned tunnel needs.
      "-o",
      "BatchMode=yes",
      // Bounds how long the initial connection attempt itself can hang;
      // otherwise a stalled handshake could sit past the 750ms window below
      // and be mistaken for a successfully established tunnel.
      "-o",
      "ConnectTimeout=10",
      "-R",
      `9000:localhost:${env.port}`,
      "dinkdonk-vps",
    ],
    {
      stdio: "inherit",
    },
  );

  let exited = false;

  process.once("exit", () => {
    logger.info({ pid: process.pid }, "SSH tunnel process exited");
    exited = true;
  });

  // ssh forks into the background on success but stays silent, so the only way to
  // tell a working tunnel apart from one that's about to fail is to wait out a
  // short window and see whether it exits on its own.
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
      if (!exited && process.pid) {
        logger.info("Killing SSH tunnel process");
        await killProcessTree(process.pid);
      }
    },
  };
}
