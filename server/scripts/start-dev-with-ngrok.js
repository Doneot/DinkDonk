const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const envPath = path.resolve(__dirname, "../.env.development");

async function getNgrokUrl() {
  while (true) {
    try {
      const res = await fetch("http://ngrok:4040/api/tunnels");
      const data = await res.json();

      const url = data.tunnels?.find((t) => t.proto === "https")?.public_url;

      if (url) {
        return url;
      }
    } catch (err) {}

    await new Promise((r) => setTimeout(r, 1000));
  }
}

function updateEnvFile(key, value) {
  let env = fs.readFileSync(envPath, "utf8");

  if (env.includes(`${key}=`)) {
    env = env.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
  } else {
    env += `\n${key}=${value}\n`;
  }

  fs.writeFileSync(envPath, env);
}

(async () => {
  const ngrokUrl = await getNgrokUrl();

  console.log("Ngrok URL:", ngrokUrl);

  process.env.SERVER_URL = ngrokUrl;

  updateEnvFile("SERVER_URL", ngrokUrl);

  const child = spawn("./node_modules/.bin/nodemon", ["src/index.js"], {
    stdio: "inherit",
    env: process.env,
  });

  function shutdown(signal) {
    console.log(`Received ${signal}, stopping backend...`);

    if (child && !child.killed) {
      child.kill(signal);
    }

    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  child.on("exit", (code, signal) => {
    if (signal === "SIGTERM" || signal === "SIGINT") {
      process.exit(0);
    }

    process.exit(code ?? 0);
  });
})();
