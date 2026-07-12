import fs from "node:fs";

export function updateEnvFile(
  envPath: string,
  key: string,
  value: string,
): void {
  const content = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf8")
    : "";

  const lines = content
    .split(/\r?\n/)
    .filter(Boolean);

  const index = lines.findIndex((line) =>
    line.startsWith(`${key}=`)
  );

  if (index !== -1) {
    lines[index] = `${key}=${value}`;
  } else {
    lines.push(`${key}=${value}`);
  }

  fs.writeFileSync(
    envPath,
    `${lines.join("\n")}\n`,
    "utf8",
  );
}