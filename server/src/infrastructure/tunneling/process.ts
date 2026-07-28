import kill from "tree-kill";

export function killProcessTree(
  pid: number | undefined,
  signal: "SIGTERM" | "SIGKILL" = "SIGTERM",
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!pid) {
      resolve();
      return;
    }

    kill(pid, signal, (error) => {
      if (!error) {
        resolve();
        return;
      }

      if (
        // On Windows, taskkill exits 128 when the process already died on its own
        // between the liveness check and the kill call; treat that race as success.
        process.platform === "win32" &&
        "code" in error &&
        error.code === 128
      ) {
        resolve();
        return;
      }

      reject(error);
    });
  });
}
