export interface Runtime {
  publicUrl: string;

  dispose(): Promise<void>;
}
