import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, "../.env.development");

async function getNgrokUrl(): Promise<string> {
  while (true) {
    try {
      const res = await fetch("http://ngrok:4040/api/tunnels");
      const data = (await res.json()) as {
        tunnels?: Array<{ proto: string; public_url: string }>;
      };

      const url = data.tunnels?.find(
        (t: { proto: string }) => t.proto === "https",
      )?.public_url;

      if (url) {
        return url;
      }
    } catch {
      // ngrok not ready yet
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 1000);
    });
  }
}

function updateEnvFile(key: string, value: string): void {
  const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

  const lines = env.split("\n");

  const updatedLines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      return `${key}=${value}`;
    }

    return line;
  });

  const keyExists = lines.some((line) => line.startsWith(`${key}=`));

  if (!keyExists) {
    updatedLines.push(`${key}=${value}`);
  }

  fs.writeFileSync(envPath, updatedLines.join("\n"));
}

void (async (): Promise<void> => {
  const ngrokUrl = await getNgrokUrl();

  console.log("Ngrok URL:", ngrokUrl);

  process.env.SERVER_URL = ngrokUrl;

  updateEnvFile("SERVER_URL", ngrokUrl);

  const child = spawn("npm", ["run", "dev"], {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });

  function shutdown(signal: NodeJS.Signals): void {
    console.log(`Received ${signal}, stopping backend...`);

    if (child && !child.killed) {
      child.kill(signal);
    }
  }

  child.on("exit", (code, _) => {
    process.exit(code ?? 0);
  });

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  child.on("exit", (code, signal) => {
    if (signal === "SIGTERM" || signal === "SIGINT") {
      process.exit(0);
    }

    process.exit(code ?? 0);
  });
})();
