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
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
