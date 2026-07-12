import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { startTunnel } from "./tunnels/index.js";
import { updateEnvFile } from "./utils/env.js";
import { getNpmCommand } from "./utils/npm.js";
import { killProcessTree } from "./utils/process.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(
  __dirname,
  "../.env.development",
);

function getTunnelType(): "ngrok" | "ssh" {
  const argument = process.argv.find((arg) =>
    arg.startsWith("--tunnel="),
  );

  const value = argument?.split("=")[1];

  return value === "ssh" ? "ssh" : "ngrok";
}

async function main(): Promise<void> {
  console.log("Using env file:", envPath);

  const tunnelType = getTunnelType();

  console.log(`Using tunnel: ${tunnelType}`);

  const tunnel = await startTunnel(tunnelType);

  console.log("Tunnel URL:", tunnel.url);

  updateEnvFile(
    envPath,
    "SERVER_URL",
    tunnel.url,
  );

  const npm = getNpmCommand();

  const backend = spawn(
    npm.command,
    [
      ...npm.args,
      "run",
      "dev",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        SERVER_URL: tunnel.url,
        NODE_ENV: "development",
      },
    },
  );

  let shuttingDown = false;

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(`Received ${signal}, stopping dev environment...`);

  // Let the backend handle SIGINT/SIGTERM itself.
  // Only wait for it to exit.

  await Promise.race([
    new Promise<void>((resolve) => backend.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5000)),
  ]);

  if (tunnel.process?.pid) {
    await killProcessTree(tunnel.process.pid);
  }

  process.exit(0);
}

  process.on(
    "SIGINT",
    () => void shutdown("SIGINT"),
  );

  process.on(
    "SIGTERM",
    () => void shutdown("SIGTERM"),
  );

  // Windows Ctrl+C alternative signal
  process.on(
    "SIGBREAK",
    () => void shutdown("SIGTERM"),
  );

  backend.on("error", (error) => {
    console.error(
      "Failed to start backend:",
      error,
    );

    void shutdown("SIGTERM");
  });

  backend.on("exit", (code) => {
    if (shuttingDown) {
      return;
    }

    if (tunnel.process?.pid) {
      void killProcessTree(tunnel.process.pid);
    }

    process.exit(code ?? 0);
  });

  if (tunnel.process) {
    tunnel.process.on("exit", (code) => {
      if (shuttingDown) {
        return;
      }

      console.log(
        `Tunnel exited unexpectedly with code ${code}`,
      );

      void killProcessTree(backend.pid);

      process.exit(code ?? 1);
    });
  }
}

void main();