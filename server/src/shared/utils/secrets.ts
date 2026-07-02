import fs from "fs";

function readSecret(name: string): string | undefined {
  const path = `/run/secrets/${name}`;

  if (!fs.existsSync(path)) {
    return undefined;
  }

  return fs.readFileSync(path, "utf8").trim();
}

export function envOrSecret(
  envName: string,
  secretName: string = envName.toLowerCase(),
): string | undefined {
  return process.env[envName] || readSecret(secretName);
}
