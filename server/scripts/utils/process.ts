import kill from "tree-kill";

export function killProcessTree(pid?: number): Promise<void> {
  return new Promise((resolve) => {
    if (!pid) {
      resolve();
      return;
    }

    kill(pid, "SIGTERM", () => {
      resolve();
    });
  });
}