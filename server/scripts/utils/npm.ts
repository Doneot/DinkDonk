export function getNpmCommand(): {
  command: string;
  args: string[];
} {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/c", "npm"],
    };
  }

  return {
    command: "npm",
    args: [],
  };
}