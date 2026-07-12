declare module "tree-kill" {
  type Signal =
    | "SIGTERM"
    | "SIGKILL"
    | "SIGINT";

  function kill(
    pid: number,
    signal: Signal,
    callback?: (error?: Error) => void,
  ): void;

  export default kill;
}