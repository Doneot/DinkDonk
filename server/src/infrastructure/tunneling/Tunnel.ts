export interface Tunnel {
  url: string;

  stop(): Promise<void>;
}
