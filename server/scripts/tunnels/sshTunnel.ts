import { spawn } from "node:child_process";

export function startSshTunnel() {
  return spawn(
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
}