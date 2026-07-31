import fs from "fs";

function readSecret(name: string): string | undefined {
  const path = `/run/secrets/${name}`;

  // A single readFileSync avoids the existsSync-then-readFileSync race
  // (the file could vanish between the two calls). A missing file is the
  // expected, silent case (most deployments don't mount every possible
  // Docker secret), but any other failure - e.g. a permissions error on a
  // mount that *does* exist - gets the checked path attached so a
  // misconfigured secret mount is diagnosable from the thrown error instead
  // of surfacing as a generic "required env var missing" message far away
  // from the actual cause.
  try {
    return fs.readFileSync(path, "utf8").trim();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === "ENOENT") {
      return undefined;
    }

    throw new Error(`Failed to read Docker secret at "${path}"`, {
      cause: error,
    });
  }
}

export function envOrSecret(
  envValue: string | undefined,
  secretName: string,
): string | undefined {
  return envValue || readSecret(secretName);
}
